<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace Dolipocket\Api\Trait;

/**
 * Process-wide flag that tells the trait whether to call exit() after streaming
 * the binary response (production) or return the captured payload instead
 * (integration tests). Lives on a regular class because PHP 8.3 deprecates
 * static trait property access.
 *
 * In production, $skipExit stays false so the controller hands off cleanly to
 * the browser and SmartAuth's RouteController never runs json_reply() after.
 *
 * In tests, set PdfDownloadRegistry::$skipExit = true; the trait will then
 * return the [body-string, http-code, headers-array] tuple via the new
 * $lastResponse static property so the test can assert on it without dying.
 */
final class PdfDownloadRegistry
{
    /** @var bool Toggle: true during tests to avoid exit() killing PHPUnit. */
    public static $skipExit = false;

    /** @var array|null Last captured [body, code, headers] (test inspection). */
    public static $lastResponse = null;
}

/**
 * Generic helper used by the five document controllers (Proposal, Order,
 * Invoice, SupplierOrder, SupplierInvoice) to stream the last generated PDF
 * to the client.
 *
 * Streaming semantics: the controller emits Content-Type / Content-Disposition /
 * Content-Length / Cache-Control headers, then readfile()s the PDF body and
 * exit()s before SmartAuth's RouteController would try to wrap the response in
 * json_reply(). The trait still returns an [body, code] array on the error
 * paths (404 / 410 / 403 / 422) so the normal SmartAuth JSON pipeline takes
 * over and the front sees a typed error.
 *
 * Auth model: this is a regular protected GET route -- SmartAuth has already
 * validated the JWT before the controller is invoked. The frontend uses
 * `useApi().get(..., { raw: true })` which keeps the Authorization header on
 * the fetch and consumes the Blob; we do NOT accept the token in the URL,
 * which avoids leaking it in the browser history / server access logs.
 */
trait PdfDownloadTrait
{
    /**
     * Stream the last generated PDF for the current document.
     *
     * @param array|null $arr    Route params (id) and request body.
     * @param array      $config Wiring for the calling controller:
     *                            - objectClass    : Dolibarr class FQN (e.g. \\Propal)
     *                            - permGroup      : Dolibarr right group ('propal',
     *                                               'commande', 'facture', ['fournisseur','commande'],
     *                                               ['fournisseur','facture'])
     *                            - logTag         : "ProposalController" / "OrderController" / ...
     *                            - notFoundLabel  : "Proposal" / "Order" / ... (for error msg)
     * @return array              [resultBody, httpCode] on error paths.
     *                            On success the function streams + exits and
     *                            never returns (or returns the captured tuple
     *                            when PdfDownloadRegistry::$skipExit is true).
     */
    public function downloadPdf($arr, array $config)
    {
        global $db, $user;

        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';
        $objectClass = isset($config['objectClass']) ? (string) $config['objectClass'] : null;
        $permGroup = isset($config['permGroup']) ? $config['permGroup'] : null;
        $notFoundLabel = isset($config['notFoundLabel']) ? (string) $config['notFoundLabel'] : 'Document';

        if ($objectClass === null || $permGroup === null) {
            dol_syslog("DPK {$logTag}::downloadPdf misconfigured (objectClass/permGroup missing)", LOG_ERR);
            return [['error' => 'Server misconfigured'], 500];
        }

        // Permission check (single-string or two-segment right group).
        // Read-only operation: 'lire' is sufficient.
        $hasRight = false;
        if (is_array($permGroup) && count($permGroup) === 2) {
            $hasRight = $user->hasRight($permGroup[0], $permGroup[1], 'lire');
        } else {
            $hasRight = $user->hasRight((string) $permGroup, 'lire');
        }
        if (!$hasRight) {
            dol_syslog("DPK {$logTag}::downloadPdf forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK {$logTag}::downloadPdf missing id", LOG_WARNING);
            return [['error' => $notFoundLabel . ' id is required'], 400];
        }

        $obj = new $objectClass($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog("DPK {$logTag}::downloadPdf not found id=" . $id, LOG_WARNING);
            return [['error' => $notFoundLabel . ' not found'], 404];
        }

        $lastMainDoc = isset($obj->last_main_doc) ? (string) $obj->last_main_doc : '';
        // Fallback: some Dolibarr core classes (CommandeFournisseur,
        // FactureFournisseur) declare last_main_doc in $fields but do NOT
        // select it inside their fetch() SQL. So even when the DB column has
        // a value, $obj->last_main_doc stays empty after fetch(). Read the
        // raw column via $obj->table_element when the property is empty so
        // production users don't see a false 404 right after generatePdf().
        if ($lastMainDoc === '' && !empty($obj->table_element)) {
            $sqlLmd = "SELECT last_main_doc FROM " . MAIN_DB_PREFIX
                . $db->escape($obj->table_element) . " WHERE rowid = " . (int) $id;
            $resLmd = $db->query($sqlLmd);
            if ($resLmd) {
                $rowLmd = $db->fetch_object($resLmd);
                if ($rowLmd && !empty($rowLmd->last_main_doc)) {
                    $lastMainDoc = (string) $rowLmd->last_main_doc;
                }
                $db->free($resLmd);
            }
        }
        if ($lastMainDoc === '') {
            dol_syslog("DPK {$logTag}::downloadPdf empty last_main_doc id=" . $id, LOG_WARNING);
            return [['error' => 'No PDF generated yet. Please generate the PDF first.'], 404];
        }

        // Resolve the absolute, canonical path and ensure it stays inside
        // DOL_DATA_ROOT. last_main_doc may already be absolute, or relative
        // to DOL_DATA_ROOT depending on the Dolibarr version. realpath()
        // collapses /../ segments so the prefix check below cannot be
        // bypassed via path traversal.
        $rawDataRoot = defined('DOL_DATA_ROOT') ? rtrim((string) DOL_DATA_ROOT, '/') : '';
        $dataRoot = $rawDataRoot;
        if ($rawDataRoot !== '') {
            $resolvedRoot = @realpath($rawDataRoot);
            if ($resolvedRoot !== false) {
                $dataRoot = rtrim($resolvedRoot, '/');
            }
        }

        $candidate = $lastMainDoc;
        if ($candidate[0] !== '/' && $dataRoot !== '') {
            $candidate = $dataRoot . '/' . $candidate;
        }
        $real = @realpath($candidate);
        if ($real === false || !is_file($real)) {
            dol_syslog("DPK {$logTag}::downloadPdf last_main_doc orphan path '" . $candidate . "'", LOG_WARNING);
            return [['error' => 'PDF file no longer exists on disk. Please regenerate.'], 410];
        }
        if ($dataRoot !== '' && strpos($real, $dataRoot) !== 0) {
            dol_syslog("DPK {$logTag}::downloadPdf last_main_doc outside DOL_DATA_ROOT '" . $real . "'", LOG_WARNING);
            return [['error' => 'Refusing to serve a file outside the document root'], 422];
        }

        // Build a safe filename for the Content-Disposition header. Prefer
        // the document ref (e.g. "PR2401-0001") over the on-disk basename.
        $refForName = isset($obj->ref) ? (string) $obj->ref : '';
        if ($refForName === '') {
            $refForName = pathinfo($real, PATHINFO_FILENAME);
        }
        if (function_exists('dol_sanitizeFileName')) {
            $refForName = dol_sanitizeFileName($refForName);
        } else {
            // Conservative fallback when running outside a Dolibarr bootstrap.
            $refForName = preg_replace('/[^A-Za-z0-9._-]/', '_', $refForName);
        }
        if ($refForName === '') {
            $refForName = $notFoundLabel . '_' . $id;
        }
        $downloadFilename = $refForName . '.pdf';

        $filesize = filesize($real);
        if ($filesize === false) {
            $filesize = 0;
        }

        dol_syslog(
            "DPK {$logTag}::downloadPdf streaming id=" . $id . " file=" . $real . " size=" . $filesize,
            LOG_INFO
        );

        $headers = [
            'Content-Type'              => 'application/pdf',
            'Content-Disposition'       => 'attachment; filename="' . $downloadFilename . '"',
            'Content-Length'            => (string) $filesize,
            'Cache-Control'             => 'private, no-cache, must-revalidate, max-age=0',
            'X-Content-Type-Options'    => 'nosniff',
        ];

        if (PdfDownloadRegistry::$skipExit) {
            // Test mode: capture the would-be response instead of streaming
            // and exiting. The harness asserts on the tuple.
            $body = @file_get_contents($real);
            PdfDownloadRegistry::$lastResponse = [
                'body'    => $body === false ? '' : $body,
                'code'    => 200,
                'headers' => $headers,
                'path'    => $real,
                'filename'=> $downloadFilename,
            ];
            return [['ok' => true, 'file' => $downloadFilename, 'size' => $filesize], 200];
        }

        // Production: stream the binary then halt before SmartAuth's
        // json_reply() runs (it would otherwise emit JSON after our headers
        // and corrupt the body).
        if (!headers_sent()) {
            http_response_code(200);
            foreach ($headers as $name => $value) {
                header($name . ': ' . $value);
            }
        }
        // readfile() streams in 8KB chunks by default, so the full file is
        // never loaded in memory -- safe even for multi-MB PDFs.
        @readfile($real);
        exit;
    }
}
