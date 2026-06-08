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
 * Process-wide registry that holds the override class name used to
 * instantiate the mailer. Lives outside the trait because PHP 8.3 deprecates
 * direct access of static trait properties (`Trait::$prop` is a no-op on
 * read, silently swallowed on write). A regular class with a static field
 * avoids that pitfall.
 *
 * In production, $cmailFileClass stays at '\\CMailFile' (Dolibarr core).
 * Integration tests override it with the FQN of a mock class so the trait
 * never opens a real SMTP socket.
 */
final class SendEmailMailerRegistry
{
    /** @var string Fully qualified CMailFile classname (default + override). */
    public static $cmailFileClass = '\\CMailFile';
}

/**
 * Generic helper used by the five document controllers (Proposal, Order,
 * Invoice, SupplierOrder, SupplierInvoice) to send the document by email
 * to a recipient with the last generated PDF attached.
 *
 * Wiring expected on the consumer:
 *  - $this->mapper is the dmXxx instance (already used elsewhere).
 *  - sendEmail() takes a single $arr (route params) and a config bag.
 *
 * Test injection: set SendEmailMailerRegistry::$cmailFileClass at runtime to
 * swap CMailFile with a mock that captures constructor args + faked
 * sendfile() result.
 */
trait SendEmailTrait
{

    /**
     * Send the current document by email with the last generated PDF as an
     * attachment.
     *
     * @param array|null $arr       Route params (id) and request body
     *                              (to, subject, body, cc, bcc, attachment_path).
     * @param array      $config    Wiring for the calling controller:
     *                              - objectClass     : Dolibarr class FQN (e.g. \\Propal)
     *                              - permGroup       : Dolibarr right group ('propal',
     *                                                  'commande', 'facture', ['fournisseur','commande'],
     *                                                  ['fournisseur','facture'])
     *                              - logTag          : "ProposalController" / "OrderController" / ...
     *                              - notFoundLabel   : "Proposal" / "Order" / ... (for error msg)
     *                              - defaultModel    : default PDF model if no last_main_doc
     *                              - addonPdfKey     : Dolibarr conf key for the PDF addon
     *                                                  ('PROPALE_ADDON_PDF', 'COMMANDE_ADDON_PDF', ...)
     *                              - sendcontext     : 'standard' (default) -- forwarded to CMailFile
     *                              - subjectPrefix   : optional label prepended when subject is empty
     *                                                  (e.g. 'Devis', 'Facture' -- accents OK)
     * @return array                [ resultBody, httpCode ]
     */
    public function sendEmail($arr, array $config)
    {
        global $db, $user, $conf;

        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';
        $objectClass = isset($config['objectClass']) ? (string) $config['objectClass'] : null;
        $permGroup = isset($config['permGroup']) ? $config['permGroup'] : null;
        $notFoundLabel = isset($config['notFoundLabel']) ? (string) $config['notFoundLabel'] : 'Document';
        $defaultModel = isset($config['defaultModel']) ? (string) $config['defaultModel'] : 'azur';
        $addonPdfKey = isset($config['addonPdfKey']) ? (string) $config['addonPdfKey'] : '';
        $sendcontext = isset($config['sendcontext']) ? (string) $config['sendcontext'] : 'standard';
        $subjectPrefix = isset($config['subjectPrefix']) ? (string) $config['subjectPrefix'] : '';

        if ($objectClass === null || $permGroup === null) {
            dol_syslog("DPK {$logTag}::send misconfigured (objectClass/permGroup missing)", LOG_ERR);
            return [['error' => 'Server misconfigured'], 500];
        }

        // Permission check (single-string or two-segment right group).
        $hasRight = false;
        if (is_array($permGroup) && count($permGroup) === 2) {
            $hasRight = $user->hasRight($permGroup[0], $permGroup[1], 'creer')
                || $user->hasRight($permGroup[0], $permGroup[1], 'lire');
        } else {
            $hasRight = $user->hasRight((string) $permGroup, 'creer')
                || $user->hasRight((string) $permGroup, 'lire');
        }
        if (!$hasRight) {
            dol_syslog("DPK {$logTag}::send forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK {$logTag}::send missing id", LOG_WARNING);
            return [['error' => $notFoundLabel . ' id is required'], 400];
        }

        $to = isset($arr['to']) ? trim((string) $arr['to']) : '';
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            dol_syslog("DPK {$logTag}::send invalid recipient '" . $to . "'", LOG_WARNING);
            return [['error' => "A valid 'to' email address is required"], 400];
        }

        $cc = isset($arr['cc']) ? trim((string) $arr['cc']) : '';
        $bcc = isset($arr['bcc']) ? trim((string) $arr['bcc']) : '';
        // CC / BCC accept "a@b,c@d" CSV -- validate each address; refuse the
        // whole request rather than silently dropping a wrong one.
        foreach (['cc' => $cc, 'bcc' => $bcc] as $kind => $list) {
            if ($list === '') continue;
            foreach (explode(',', $list) as $piece) {
                $piece = trim($piece);
                if ($piece !== '' && !filter_var($piece, FILTER_VALIDATE_EMAIL)) {
                    dol_syslog("DPK {$logTag}::send invalid {$kind} address '" . $piece . "'", LOG_WARNING);
                    return [['error' => "Invalid email in {$kind}: " . $piece], 400];
                }
            }
        }

        // Instantiate and fetch the document.
        $obj = new $objectClass($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog("DPK {$logTag}::send not found id=" . $id, LOG_WARNING);
            return [['error' => $notFoundLabel . ' not found'], 404];
        }
        if (method_exists($obj, 'fetch_lines')) {
            $obj->fetch_lines();
        }
        if (method_exists($obj, 'fetch_thirdparty')) {
            $obj->fetch_thirdparty();
        }

        // Resolve the PDF attachment path. Priority:
        //   1. caller-provided attachment_path (must exist and live in the
        //      Dolibarr documents root for safety).
        //   2. $obj->last_main_doc -- relative to DOL_DATA_ROOT.
        // If neither is set, we generate the PDF on the fly so the user gets
        // an attachment without having to click "Générer PDF" separately.
        $attachmentPath = isset($arr['attachment_path']) ? (string) $arr['attachment_path'] : '';
        $resolvedAttachment = $this->resolveAttachmentPath($attachmentPath, $obj, $logTag);

        if ($resolvedAttachment === null) {
            // Generate the PDF on the fly so we always send with something attached.
            global $langs;
            $model = $addonPdfKey !== '' ? (string) (getDolGlobalString($addonPdfKey) ?: $defaultModel) : $defaultModel;
            dol_syslog("DPK {$logTag}::send auto-generating PDF with model=" . $model, LOG_INFO);
            if (method_exists($obj, 'generateDocument')) {
                $gen = $obj->generateDocument($model, $langs, 0, 0, 0);
                if ($gen <= 0) {
                    dol_syslog("DPK {$logTag}::send generateDocument() failed: " . ($obj->error ?? 'unknown'), LOG_ERR);
                    return [['error' => 'Failed to generate PDF before sending: ' . ($obj->error ?? '')], 500];
                }
            } else {
                dol_syslog("DPK {$logTag}::send object has no generateDocument()", LOG_ERR);
                return [['error' => 'Document type does not support PDF generation'], 500];
            }
            // After regen, last_main_doc should be set.
            $resolvedAttachment = $this->resolveAttachmentPath('', $obj, $logTag);
            if ($resolvedAttachment === null) {
                dol_syslog("DPK {$logTag}::send no attachment available after generation", LOG_ERR);
                return [['error' => 'No PDF attachment available'], 500];
            }
        }

        // Build the subject and the body.
        $rawSubject = isset($arr['subject']) ? trim((string) $arr['subject']) : '';
        $rawBody = isset($arr['body']) ? (string) $arr['body'] : '';
        $subject = $rawSubject !== ''
            ? $rawSubject
            : trim($subjectPrefix . ' ' . (string) ($obj->ref ?? ''));
        if ($subject === '') {
            $subject = $notFoundLabel . ' #' . $id;
        }
        if ($rawBody === '') {
            // Minimal default body so CMailFile does not refuse with
            // ErrorBodyIsRequired -- consumers are encouraged to provide one.
            $rawBody = $subject;
        }

        // Resolve the From address. Priority:
        //   1. MAIN_MAIL_EMAIL_FROM (global Dolibarr config -- standard).
        //   2. user->email if the connected user has one.
        //   3. 'no-reply@<host>' fallback so CMailFile constructor accepts.
        $from = (string) (getDolGlobalString('MAIN_MAIL_EMAIL_FROM') ?: '');
        if ($from === '' && !empty($user->email)) {
            $from = (string) $user->email;
        }
        if ($from === '') {
            $host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : 'localhost';
            $from = 'no-reply@' . $host;
        }

        $filenameList = [$resolvedAttachment];
        $mimetypeList = ['application/pdf'];
        $mimefilenameList = [basename($resolvedAttachment)];

        $trackid = $this->buildTrackId($obj, $logTag);

        $mailerClass = SendEmailMailerRegistry::$cmailFileClass;
        if (!class_exists($mailerClass)) {
            require_once DOL_DOCUMENT_ROOT . '/core/class/CMailFile.class.php';
        }

        $msgIsHtml = isset($arr['ishtml']) ? (int) $arr['ishtml'] : 0;

        // Constructor signature (CMailFile.class.php):
        //   __construct($subject, $to, $from, $msg,
        //               $filename_list=array(), $mimetype_list=array(),
        //               $mimefilename_list=array(),
        //               $addr_cc='', $addr_bcc='', $deliveryreceipt=0,
        //               $msgishtml=0, $errors_to='', $css='', $trackid='',
        //               $moreinheader='', $sendcontext='standard',
        //               $replyto='', $upload_dir_tmp='')
        $mailer = new $mailerClass(
            $subject,
            $to,
            $from,
            $rawBody,
            $filenameList,
            $mimetypeList,
            $mimefilenameList,
            $cc,
            $bcc,
            0,
            $msgIsHtml,
            '',
            '',
            $trackid,
            '',
            $sendcontext
        );

        $sent = $mailer->sendfile();

        if ($sent !== true && $sent !== 1) {
            $err = isset($mailer->error) ? (string) $mailer->error : 'CMailFile sendfile returned ' . var_export($sent, true);
            dol_syslog("DPK {$logTag}::send sendfile() failed: " . $err, LOG_ERR);
            return [
                ['error' => 'Failed to send email: ' . $err],
                500,
            ];
        }

        dol_syslog(
            "DPK {$logTag}::send ok id=" . $id . " to=" . $to . " attachment=" . $resolvedAttachment,
            LOG_INFO
        );

        return [
            [
                'ok'         => true,
                'to'         => $to,
                'cc'         => $cc,
                'bcc'        => $bcc,
                'subject'    => $subject,
                'attachment' => $resolvedAttachment,
                'trackid'    => $trackid,
            ],
            200,
        ];
    }

    /**
     * Resolve the absolute attachment file path. Returns null when no
     * suitable attachment is available.
     *
     * @param string $clientPath  Optional client-provided override (relative
     *                            to DOL_DATA_ROOT or absolute path under it).
     * @param object $obj         Dolibarr document object (must expose
     *                            $last_main_doc when no override is given).
     * @param string $logTag      Log tag prefix.
     * @return string|null
     */
    private function resolveAttachmentPath($clientPath, $obj, $logTag)
    {
        // Resolve DOL_DATA_ROOT through realpath() so the safety prefix
        // check below compares canonical paths (otherwise relative
        // segments like /../ in the conf.php definition would make
        // strpos() return false even for legitimate paths).
        $rawDataRoot = defined('DOL_DATA_ROOT') ? rtrim((string) DOL_DATA_ROOT, '/') : '';
        $dataRoot = $rawDataRoot;
        if ($rawDataRoot !== '') {
            $resolvedRoot = @realpath($rawDataRoot);
            if ($resolvedRoot !== false) {
                $dataRoot = rtrim($resolvedRoot, '/');
            }
        }

        // 1. Explicit override.
        if ($clientPath !== '') {
            // Normalise: if the user passed a relative path, anchor it to DOL_DATA_ROOT.
            $candidate = $clientPath;
            if ($candidate[0] !== '/' && $dataRoot !== '') {
                $candidate = $dataRoot . '/' . $candidate;
            }
            $real = @realpath($candidate);
            if ($real === false || !is_file($real)) {
                dol_syslog("DPK {$logTag}::send attachment override not found '" . $candidate . "'", LOG_WARNING);
                return null;
            }
            // Safety: refuse files outside DOL_DATA_ROOT to avoid arbitrary
            // file read via an authenticated session.
            if ($dataRoot !== '' && strpos($real, $dataRoot) !== 0) {
                dol_syslog("DPK {$logTag}::send attachment override outside DOL_DATA_ROOT '" . $real . "'", LOG_WARNING);
                return null;
            }
            return $real;
        }

        // 2. Fall back to last_main_doc.
        $lastMainDoc = isset($obj->last_main_doc) ? (string) $obj->last_main_doc : '';
        if ($lastMainDoc === '') {
            return null;
        }
        $candidate = $lastMainDoc;
        // last_main_doc may already be absolute or relative to DOL_DATA_ROOT.
        if ($candidate[0] !== '/' && $dataRoot !== '') {
            $candidate = $dataRoot . '/' . $candidate;
        }
        if (!is_file($candidate)) {
            dol_syslog("DPK {$logTag}::send last_main_doc points to a non-existing file '" . $candidate . "'", LOG_WARNING);
            return null;
        }
        return $candidate;
    }

    /**
     * Build a track id matching Dolibarr's convention "<element>-<rowid>".
     *
     * @param object $obj
     * @param string $logTag
     * @return string
     */
    private function buildTrackId($obj, $logTag)
    {
        $element = isset($obj->element) ? (string) $obj->element : strtolower($logTag);
        $rowid = isset($obj->id) ? (int) $obj->id : 0;
        return $element . '-' . $rowid;
    }
}
