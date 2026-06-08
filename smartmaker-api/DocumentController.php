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
 */

namespace Dolipocket\Api;

require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';
require_once DOL_DOCUMENT_ROOT.'/core/lib/security.lib.php';
require_once DOL_DOCUMENT_ROOT.'/core/lib/security2.lib.php';
require_once DOL_DOCUMENT_ROOT.'/ecm/class/ecmfiles.class.php';

use SmartAuth\Api\UploadHelper;
use EcmFiles;

/**
 * Process-wide flag and capture slot for DocumentController::download().
 * Mirrors PdfDownloadRegistry so integration tests can intercept the
 * binary streaming without dying inside exit(). In production both fields
 * stay at their default values: $skipExit = false means the controller
 * streams the file then exits as expected.
 */
final class DocumentDownloadRegistry
{
    /** @var bool Toggle: true during tests to avoid exit() killing PHPUnit. */
    public static $skipExit = false;

    /** @var array|null Last captured [body, code, headers] (test inspection). */
    public static $lastResponse = null;
}

/**
 * DocumentController
 *
 * Bridges SmartAuth's generic /upload staging route with Dolibarr's per-object
 * document directory. The PWA first POSTs the binary to /upload (provided by
 * SmartAuth), receives an upload_id, then calls POST /document/attach (handled
 * here) with { upload_id, object_type, object_id, filename }. We:
 *
 *   1. Resolve the target object (Societe, Product, Propal, ...) and verify
 *      the current user owns the right to attach a document on it.
 *   2. Compute the canonical Dolibarr dir_output path for that object.
 *   3. Move the staged file via SmartAuth\Api\UploadHelper::consumeUpload().
 *   4. Create an llx_ecm_files row so the file shows up in the GED and gets
 *      a share hash usable by GET /object/{type}/{id}/document?q=<share>.
 *
 * Reference docs:
 *   - ~/docs/UPLOAD_PWA.md (binary upload pattern)
 *   - ~/dev/smartauth/api/UploadHelper.php (consumeUpload contract)
 *   - ~/dev/smartauth/api/ObjectDocumentController.php (downstream listing)
 */
class DocumentController
{
    /**
     * Whitelist of object types the PWA is allowed to attach documents to.
     *
     * Each entry tells the controller:
     *   - class            : Dolibarr class name to load
     *   - file             : path to that class file relative to DOL_DOCUMENT_ROOT
     *   - module           : Dolibarr module code (used for isModEnabled() and rights)
     *   - dir_output_key   : conf->{this}->dir_output / multidir_output[entity]
     *   - subdir_strategy  : 'id' (numeric subdir) or 'ref' (sanitized ref subdir)
     *   - perm_resource    : Dolibarr permission resource (e.g. 'societe')
     *   - perm_action      : Dolibarr permission action  (e.g. 'creer')
     *   - table_element    : value used in llx_ecm_files.src_object_type
     *
     * @var array<string, array<string, string>>
     */
    private static $objectTypeMap = [
        'thirdparty' => [
            'class'           => 'Societe',
            'file'            => '/societe/class/societe.class.php',
            'module'          => 'societe',
            'dir_output_key'  => 'societe',
            'subdir_strategy' => 'id',
            'perm_resource'   => 'societe',
            'perm_action'     => 'creer',
            'table_element'   => 'societe',
        ],
        'product' => [
            'class'           => 'Product',
            'file'            => '/product/class/product.class.php',
            'module'          => 'product',
            'dir_output_key'  => 'product',
            'subdir_strategy' => 'ref',
            'perm_resource'   => 'produit',
            'perm_action'     => 'creer',
            'table_element'   => 'product',
        ],
        'proposal' => [
            'class'           => 'Propal',
            'file'            => '/comm/propal/class/propal.class.php',
            'module'          => 'propal',
            'dir_output_key'  => 'propal',
            'subdir_strategy' => 'ref',
            'perm_resource'   => 'propal',
            'perm_action'     => 'creer',
            'table_element'   => 'propal',
        ],
        'order' => [
            'class'           => 'Commande',
            'file'            => '/commande/class/commande.class.php',
            'module'          => 'commande',
            'dir_output_key'  => 'commande',
            'subdir_strategy' => 'ref',
            'perm_resource'   => 'commande',
            'perm_action'     => 'creer',
            'table_element'   => 'commande',
        ],
        'invoice' => [
            'class'           => 'Facture',
            'file'            => '/compta/facture/class/facture.class.php',
            'module'          => 'facture',
            'dir_output_key'  => 'facture',
            'subdir_strategy' => 'ref',
            'perm_resource'   => 'facture',
            'perm_action'     => 'creer',
            'table_element'   => 'facture',
        ],
        'supplier_order' => [
            'class'           => 'CommandeFournisseur',
            'file'            => '/fourn/class/fournisseur.commande.class.php',
            'module'          => 'fournisseur',
            'dir_output_key'  => 'fournisseur',
            'subdir_strategy' => 'supplier_order_ref',
            'perm_resource'   => 'fournisseur',
            'perm_action'     => 'commande_creer',
            'table_element'   => 'commande_fournisseur',
        ],
        'supplier_invoice' => [
            'class'           => 'FactureFournisseur',
            'file'            => '/fourn/class/fournisseur.facture.class.php',
            'module'          => 'fournisseur',
            'dir_output_key'  => 'fournisseur',
            'subdir_strategy' => 'supplier_invoice_ref',
            'perm_resource'   => 'fournisseur',
            'perm_action'     => 'facture_creer',
            'table_element'   => 'invoice_supplier',
        ],
        'agenda' => [
            'class'           => 'ActionComm',
            'file'            => '/comm/action/class/actioncomm.class.php',
            'module'          => 'agenda',
            'dir_output_key'  => 'agenda',
            'subdir_strategy' => 'agenda_id',
            'perm_resource'   => 'agenda',
            'perm_action'     => 'myactions_create',
            'table_element'   => 'actioncomm',
        ],
        'event' => [
            'class'           => 'ActionComm',
            'file'            => '/comm/action/class/actioncomm.class.php',
            'module'          => 'agenda',
            'dir_output_key'  => 'agenda',
            'subdir_strategy' => 'agenda_id',
            'perm_resource'   => 'agenda',
            'perm_action'     => 'myactions_create',
            'table_element'   => 'actioncomm',
        ],
        'project' => [
            'class'           => 'Project',
            'file'            => '/projet/class/project.class.php',
            'module'          => 'projet',
            'dir_output_key'  => 'projet',
            'subdir_strategy' => 'ref',
            'perm_resource'   => 'projet',
            'perm_action'     => 'creer',
            'table_element'   => 'projet',
        ],
        'category' => [
            'class'           => 'Categorie',
            'file'            => '/categories/class/categorie.class.php',
            'module'          => 'categorie',
            'dir_output_key'  => 'categorie',
            'subdir_strategy' => 'category',
            'perm_resource'   => 'categorie',
            'perm_action'     => 'creer',
            'table_element'   => 'categorie',
        ],
    ];

    /**
     * POST /document/attach
     *
     * Move a staged upload (created by SmartAuth's POST /upload) to the
     * canonical Dolibarr directory of the target object and register it in
     * llx_ecm_files so it is visible in the GED.
     *
     * Expected payload: upload_id, object_type, object_id, filename (optional).
     *
     * @param array|null $arr Decoded JSON body merged with route params
     * @return array          [responseBody, httpStatus]
     */
    public function attach($arr = null)
    {
        global $db, $user, $conf;

        dol_syslog('DPK DocumentController::attach');

        $arr = is_array($arr) ? $arr : [];

        // ----- Input validation -----
        $uploadId = isset($arr['upload_id']) ? trim((string) $arr['upload_id']) : '';
        if ($uploadId === '' || strlen($uploadId) > 128 || !preg_match('/^[A-Za-z0-9_\-]+$/', $uploadId)) {
            dol_syslog('DPK DocumentController::attach invalid or missing upload_id', LOG_ERR);
            return [['error' => 'Invalid or missing upload_id'], 400];
        }

        $type = isset($arr['object_type']) ? trim((string) $arr['object_type']) : '';
        if ($type === '' || !isset(self::$objectTypeMap[$type])) {
            dol_syslog('DPK DocumentController::attach invalid object_type='.$type, LOG_ERR);
            return [['error' => 'Invalid object_type'], 400];
        }
        $cfg = self::$objectTypeMap[$type];

        $objectId = isset($arr['object_id']) ? (int) $arr['object_id'] : 0;
        if ($objectId <= 0) {
            dol_syslog('DPK DocumentController::attach invalid object_id='.($arr['object_id'] ?? 'null'), LOG_ERR);
            return [['error' => 'Invalid object_id'], 400];
        }

        if (empty($user) || !is_object($user) || empty($user->id)) {
            dol_syslog('DPK DocumentController::attach missing authenticated user', LOG_ERR);
            return [['error' => 'Authentication required'], 401];
        }

        // ----- Module enabled check -----
        if (!isModEnabled($cfg['module'])) {
            dol_syslog('DPK DocumentController::attach module not enabled: '.$cfg['module'], LOG_ERR);
            return [['error' => 'Module not enabled: '.$cfg['module']], 403];
        }

        // ----- Permission check -----
        if (!$this->hasAttachPermission($user, $cfg)) {
            dol_syslog('DPK DocumentController::attach denied for user '.$user->id.' on type='.$type, LOG_ERR);
            return [['error' => 'Access denied'], 403];
        }

        // ----- Load target object -----
        require_once DOL_DOCUMENT_ROOT.$cfg['file'];
        $className = $cfg['class'];
        if (!class_exists($className)) {
            dol_syslog('DPK DocumentController::attach class not found: '.$className, LOG_ERR);
            return [['error' => 'Object class unavailable'], 500];
        }
        /** @var \CommonObject $object */
        $object = new $className($db);
        $fetched = $object->fetch($objectId);
        if ($fetched <= 0) {
            dol_syslog('DPK DocumentController::attach object not found type='.$type.' id='.$objectId, LOG_ERR);
            return [['error' => 'Object not found'], 404];
        }

        // ----- Entity scoping -----
        $objectEntity = isset($object->entity) ? (int) $object->entity : (int) $conf->entity;
        $allowedEntities = $this->getAllowedEntities($cfg);
        if (!in_array($objectEntity, $allowedEntities, true)) {
            dol_syslog('DPK DocumentController::attach entity mismatch: object='.$objectEntity.' allowed='.implode(',', $allowedEntities), LOG_ERR);
            return [['error' => 'Object not in current entity'], 403];
        }

        // ----- Resolve target directory -----
        $destDir = $this->resolveObjectDir($object, $cfg, $conf, $objectEntity);
        if ($destDir === null) {
            dol_syslog('DPK DocumentController::attach could not resolve dir_output for type='.$type.' id='.$objectId, LOG_ERR);
            return [['error' => 'Cannot resolve object directory'], 500];
        }

        // Ensure the directory exists.
        if (!is_dir($destDir)) {
            if (function_exists('dol_mkdir')) {
                dol_mkdir($destDir);
            } else {
                @mkdir($destDir, 0755, true);
            }
            if (!is_dir($destDir)) {
                dol_syslog('DPK DocumentController::attach failed to create dir '.$destDir, LOG_ERR);
                return [['error' => 'Failed to create object directory'], 500];
            }
        }

        // ----- Resolve final filename -----
        $rawFilename = isset($arr['filename']) ? (string) $arr['filename'] : '';
        if ($rawFilename === '') {
            // Fall back to the staged upload metadata.
            $staged = UploadHelper::describe($uploadId, (int) $user->id);
            if ($staged === null) {
                dol_syslog('DPK DocumentController::attach upload_id not found or expired for user '.$user->id, LOG_ERR);
                return [['error' => 'Upload not found or expired'], 404];
            }
            $rawFilename = (string) ($staged['filename'] ?? 'upload.bin');
        }
        $safeFilename = dol_sanitizeFileName($rawFilename);
        if ($safeFilename === '' || $safeFilename === '.' || $safeFilename === '..') {
            dol_syslog('DPK DocumentController::attach invalid filename after sanitize: '.$rawFilename, LOG_ERR);
            return [['error' => 'Invalid filename'], 400];
        }

        // Avoid collision with an existing file (preserve original extension).
        $finalFilename = $this->resolveCollisionSafeName($destDir, $safeFilename);
        $destPath = $destDir.'/'.$finalFilename;

        // ----- Consume the staged upload -----
        if (!class_exists('\\SmartAuth\\Api\\UploadHelper')) {
            dol_syslog('DPK DocumentController::attach SmartAuth UploadHelper unavailable', LOG_ERR);
            return [['error' => 'SmartAuth too old: UploadHelper missing'], 500];
        }
        $consumed = UploadHelper::consumeUpload($uploadId, (int) $user->id, $destPath);
        if ($consumed === null) {
            dol_syslog('DPK DocumentController::attach consumeUpload failed for id='.$uploadId.' dest='.$destPath, LOG_ERR);
            return [['error' => 'Failed to consume staged upload'], 500];
        }

        // ----- Register in llx_ecm_files -----
        $ecmEntry = $this->createEcmEntry(
            $destPath,
            $finalFilename,
            $consumed,
            $cfg,
            $object,
            $objectEntity,
            $user
        );
        if ($ecmEntry === null) {
            dol_syslog('DPK DocumentController::attach EcmFiles creation failed for '.$destPath, LOG_ERR);
            // The file is on disk but ecm_files insert failed: keep the file
            // (it would still appear via the filesystem listing) and report
            // a soft success so the PWA can refresh and surface it.
            return [[
                'attached' => true,
                'warning'  => 'ecm_files insert failed, file is on disk',
                'filename' => $finalFilename,
                'mime'     => (string) ($consumed['mime'] ?? ''),
                'size'     => (int) ($consumed['size'] ?? 0),
                'sha256'   => (string) ($consumed['sha256'] ?? ''),
                'object_type' => $type,
                'object_id'   => $objectId,
            ], 200];
        }

        $relativePath = $finalFilename;
        $response = [
            'attached'      => true,
            'object_type'   => $type,
            'object_id'     => $objectId,
            'ecm_id'        => (int) $ecmEntry['ecm_id'],
            'share'         => (string) $ecmEntry['share'],
            'filename'      => $finalFilename,
            'relative_path' => $relativePath,
            'mime'          => (string) ($consumed['mime'] ?? ''),
            'mime_type'     => (string) ($consumed['mime'] ?? ''),
            'size'          => (int) ($consumed['size'] ?? 0),
            'sha256'        => (string) ($consumed['sha256'] ?? ''),
            'date_creation' => (int) dol_now(),
            'date_modification' => (int) dol_now(),
        ];

        dol_syslog('DPK DocumentController::attach ok type='.$type.' id='.$objectId.' file='.$finalFilename.' share='.$response['share']);

        return [$response, 201];
    }

    /**
     * Return the list of entity ids a query like getEntity('societe') would
     * include for the current $conf->entity. We rely on the native helper
     * because Dolipocket's multi-tenant model leans on $conf->entity scoping.
     *
     * @param array $cfg Object type config
     * @return int[]
     */
    private function getAllowedEntities($cfg)
    {
        global $conf;
        $tableElement = $cfg['table_element'] ?? '';
        $module = $cfg['module'] ?? '';
        $hint = $tableElement !== '' ? $tableElement : $module;

        if ($hint !== '' && function_exists('getEntity')) {
            $csv = getEntity($hint);
            $ids = [];
            foreach (explode(',', (string) $csv) as $part) {
                $part = trim($part);
                if ($part !== '' && is_numeric($part)) {
                    $ids[] = (int) $part;
                }
            }
            if (!empty($ids)) {
                return $ids;
            }
        }
        return [(int) $conf->entity];
    }

    /**
     * Check that the user can attach a document for the given object type.
     *
     * The map declares the Dolibarr permission resource/action combination
     * that gates uploads. Compound actions like 'commande_creer' or
     * 'myactions_create' are split on '_' to feed the Dolibarr API which
     * accepts variadic arguments.
     *
     * @param object $user
     * @param array  $cfg
     * @return bool
     */
    private function hasAttachPermission($user, $cfg)
    {
        if (!empty($user->admin)) {
            return true;
        }
        $resource = (string) $cfg['perm_resource'];
        $action = (string) $cfg['perm_action'];
        if ($resource === '' || $action === '') {
            return false;
        }
        $parts = explode('_', $action);
        if (count($parts) === 1) {
            return (bool) $user->hasRight($resource, $parts[0]);
        }
        // Two-level permissions, e.g. agenda.myactions.create or fournisseur.commande.creer
        return (bool) $user->hasRight($resource, $parts[0], $parts[1]);
    }

    /**
     * Resolve the absolute on-disk directory where the file should be stored.
     *
     * @param object $object       Loaded Dolibarr object
     * @param array  $cfg          Object type config
     * @param object $conf         Dolibarr config
     * @param int    $objectEntity Entity hosting the object
     * @return string|null         Absolute directory path, or null on failure
     */
    private function resolveObjectDir($object, $cfg, $conf, $objectEntity)
    {
        $key = $cfg['dir_output_key'];
        $modulepart = isset($conf->$key) ? $conf->$key : null;
        if ($modulepart === null) {
            return null;
        }

        $base = '';
        if (isset($modulepart->multidir_output[$objectEntity]) && $modulepart->multidir_output[$objectEntity] !== '') {
            $base = (string) $modulepart->multidir_output[$objectEntity];
        } elseif (isset($modulepart->dir_output) && $modulepart->dir_output !== '') {
            $base = (string) $modulepart->dir_output;
        }
        if ($base === '') {
            return null;
        }

        switch ($cfg['subdir_strategy']) {
            case 'id':
                return rtrim($base, '/').'/'.((int) $object->id);

            case 'ref':
                $ref = isset($object->ref) ? (string) $object->ref : '';
                if ($ref === '') {
                    return null;
                }
                return rtrim($base, '/').'/'.dol_sanitizeFileName($ref);

            case 'supplier_order_ref':
                // Supplier orders are stored under fournisseur/commande/<ref>
                $ref = isset($object->ref) ? (string) $object->ref : '';
                if ($ref === '') {
                    return null;
                }
                return rtrim($base, '/').'/commande/'.dol_sanitizeFileName($ref);

            case 'supplier_invoice_ref':
                // Supplier invoices: fournisseur/facture/<ref>
                $ref = isset($object->ref) ? (string) $object->ref : '';
                if ($ref === '') {
                    return null;
                }
                return rtrim($base, '/').'/facture/'.dol_sanitizeFileName($ref);

            case 'agenda_id':
                // ActionComm uses agenda/<id>/ (no ref-based dir)
                return rtrim($base, '/').'/'.((int) $object->id);

            case 'category':
                // Replicate Dolibarr's get_exdir($id, 2, 0, 0, $object, 'category')
                $id = (int) $object->id;
                $num = substr('000'.$id, -2);
                return rtrim($base, '/').'/'.substr($num, 1, 1).'/'.substr($num, 0, 1).'/'.$id;

            default:
                return null;
        }
    }

    /**
     * Pick a final filename that does not collide with an existing entry.
     * If "report.pdf" exists, returns "report-1.pdf", "report-2.pdf", ...
     *
     * @param string $dir
     * @param string $filename Already sanitized
     * @return string
     */
    private function resolveCollisionSafeName($dir, $filename)
    {
        $candidate = $filename;
        if (!file_exists($dir.'/'.$candidate)) {
            return $candidate;
        }

        $dot = strrpos($filename, '.');
        if ($dot === false || $dot === 0) {
            $stem = $filename;
            $ext = '';
        } else {
            $stem = substr($filename, 0, $dot);
            $ext = substr($filename, $dot);
        }

        for ($i = 1; $i < 1000; $i++) {
            $candidate = $stem.'-'.$i.$ext;
            if (!file_exists($dir.'/'.$candidate)) {
                return $candidate;
            }
        }
        // Last-resort fallback: append a random suffix so we never overwrite.
        return $stem.'-'.bin2hex(random_bytes(4)).$ext;
    }

    /**
     * Create the llx_ecm_files row for the freshly attached file.
     *
     * @param string $absPath       Absolute path of the file on disk
     * @param string $finalFilename Filename within $destDir
     * @param array  $consumed      Metadata returned by UploadHelper::consumeUpload
     * @param array  $cfg           Object type config
     * @param object $object        Loaded Dolibarr object (provides id)
     * @param int    $objectEntity  Entity owning the object
     * @param object $user          Current user
     * @return array|null           ['ecm_id' => int, 'share' => string] or null on failure
     */
    private function createEcmEntry($absPath, $finalFilename, $consumed, $cfg, $object, $objectEntity, $user)
    {
        global $db;

        // EcmFiles stores filepath as a path relative to DOL_DATA_ROOT.
        $dataRoot = rtrim(DOL_DATA_ROOT, '/').'/';
        $absDir = rtrim(dirname($absPath), '/');
        $relDir = $absDir;
        if (strpos($absDir.'/', $dataRoot) === 0) {
            $relDir = substr($absDir, strlen($dataRoot));
        }
        $relDir = rtrim($relDir, '/');

        $ecm = new EcmFiles($db);
        $ecm->filename = $finalFilename;
        $ecm->filepath = $relDir;
        $ecm->fullpath_orig = (string) ($consumed['filename'] ?? $finalFilename);
        $ecm->entity = (int) $objectEntity;
        $ecm->src_object_type = (string) $cfg['table_element'];
        $ecm->src_object_id = (int) $object->id;
        $ecm->gen_or_uploaded = 'uploaded';
        $ecm->share = getRandomPassword(true);
        $ecm->date_c = dol_now();

        // label = md5 of file content (Dolibarr convention).
        $encodedPath = function_exists('dol_osencode') ? dol_osencode($absPath) : $absPath;
        if (file_exists($encodedPath)) {
            $ecm->label = md5_file($encodedPath);
        }

        $created = $ecm->create($user);
        if ($created <= 0) {
            $errMsg = is_array($ecm->errors) && !empty($ecm->errors) ? implode('; ', $ecm->errors) : (string) ($ecm->error ?? '');
            dol_syslog('DPK DocumentController::createEcmEntry create() failed: '.$errMsg, LOG_ERR);
            return null;
        }

        return [
            'ecm_id' => (int) $created,
            'share'  => (string) $ecm->share,
        ];
    }

    /**
     * GET /document?objectType=<type>&objectId=<id>
     *
     * List every file currently sitting in the Dolibarr document directory of
     * a given object. Returns metadata only -- no file content. This is the
     * primary consumer of the "Documents" section displayed below the
     * <DocumentLinesEditor> on the five PageDetail desktop views (Proposal,
     * Order, Invoice, SupplierOrder, SupplierInvoice).
     *
     * Why a dedicated endpoint instead of reusing SmartAuth's
     * GET /object/{type}/{id}/documents : SmartAuth only knows about
     * product/thirdparty/project/intervention/category. The 11 Dolipocket
     * object types (propal, commande, facture, supplier_order,
     * supplier_invoice, agenda, ...) are whitelisted right here in
     * $objectTypeMap together with the directory resolution strategy that
     * matches what the core Dolibarr PDF generators write to disk.
     *
     * The endpoint walks the on-disk directory (so it catches every file:
     * generated PDFs, attached uploads, manually copied files) and indexes
     * llx_ecm_files entries by (filepath, filename). When a row exists, we
     * include its primary key and share hash in the response. When it does
     * not (file present on disk but not yet registered, e.g. a freshly
     * generated PDF from before Dolipocket existed), we still expose the
     * file with ecm_id=0 so the user can see it -- the dedicated download
     * route serves it via its filename as a fallback (see download() below).
     *
     * @param array|null $arr Decoded query string merged by SmartAuth.
     * @return array          [responseBody, httpStatus]
     */
    public function list($arr = null)
    {
        global $db, $user, $conf;

        dol_syslog('DPK DocumentController::list');

        $arr = is_array($arr) ? $arr : [];

        // ----- Input validation -----
        if (empty($user) || !is_object($user) || empty($user->id)) {
            dol_syslog('DPK DocumentController::list missing authenticated user', LOG_ERR);
            return [['error' => 'Authentication required'], 401];
        }

        $type = isset($arr['objectType']) ? trim((string) $arr['objectType']) : '';
        if ($type === '' && isset($arr['object_type'])) {
            // Accept snake_case alias too -- the PWA may send either form.
            $type = trim((string) $arr['object_type']);
        }
        if ($type === '' || !isset(self::$objectTypeMap[$type])) {
            dol_syslog('DPK DocumentController::list invalid objectType='.$type, LOG_ERR);
            return [['error' => 'Invalid objectType'], 400];
        }
        $cfg = self::$objectTypeMap[$type];

        $objectId = isset($arr['objectId']) ? (int) $arr['objectId'] : 0;
        if ($objectId <= 0 && isset($arr['object_id'])) {
            $objectId = (int) $arr['object_id'];
        }
        if ($objectId <= 0) {
            dol_syslog('DPK DocumentController::list invalid objectId='.($arr['objectId'] ?? $arr['object_id'] ?? 'null'), LOG_ERR);
            return [['error' => 'Invalid objectId'], 400];
        }

        // ----- Module enabled check -----
        if (!isModEnabled($cfg['module'])) {
            dol_syslog('DPK DocumentController::list module not enabled: '.$cfg['module'], LOG_ERR);
            return [['error' => 'Module not enabled: '.$cfg['module']], 403];
        }

        // ----- Permission check (read variant: 'lire' instead of 'creer') -----
        if (!$this->hasReadPermission($user, $cfg)) {
            dol_syslog('DPK DocumentController::list denied for user '.$user->id.' on type='.$type, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        // ----- Load target object -----
        require_once DOL_DOCUMENT_ROOT.$cfg['file'];
        $className = $cfg['class'];
        if (!class_exists($className)) {
            dol_syslog('DPK DocumentController::list class not found: '.$className, LOG_ERR);
            return [['error' => 'Object class unavailable'], 500];
        }
        /** @var \CommonObject $object */
        $object = new $className($db);
        $fetched = $object->fetch($objectId);
        if ($fetched <= 0) {
            dol_syslog('DPK DocumentController::list object not found type='.$type.' id='.$objectId, LOG_ERR);
            return [['error' => 'Object not found'], 404];
        }

        // ----- Entity scoping -----
        $objectEntity = isset($object->entity) ? (int) $object->entity : (int) $conf->entity;
        $allowedEntities = $this->getAllowedEntities($cfg);
        if (!in_array($objectEntity, $allowedEntities, true)) {
            dol_syslog('DPK DocumentController::list entity mismatch: object='.$objectEntity.' allowed='.implode(',', $allowedEntities), LOG_WARNING);
            return [['error' => 'Object not in current entity'], 403];
        }

        // ----- Resolve target directory -----
        $dir = $this->resolveObjectDir($object, $cfg, $conf, $objectEntity);
        if ($dir === null) {
            dol_syslog('DPK DocumentController::list could not resolve dir_output for type='.$type.' id='.$objectId, LOG_WARNING);
            // Not a failure: an object freshly created with no document has no
            // dir yet. Return an empty list so the PWA renders the
            // "no documents" state.
            return [['documents' => [], 'object_type' => $type, 'object_id' => $objectId], 200];
        }
        if (!is_dir($dir)) {
            return [['documents' => [], 'object_type' => $type, 'object_id' => $objectId], 200];
        }

        // ----- Walk the directory recursively, skipping previews/meta -----
        // dol_dir_list returns an array of [name, fullname, size, date, ...]
        // entries. We exclude the auto-generated *_preview*.png + .meta files
        // (mirrors what SmartAuth's ObjectDocumentController already does).
        $files = function_exists('dol_dir_list')
            ? dol_dir_list($dir, 'files', 1, '', array('(\.meta|_preview.*\.png)$', '^\.'), 'date', SORT_DESC, 1)
            : [];

        // ----- Index llx_ecm_files entries for this object -----
        $ecmIndex = $this->loadEcmIndex((string) $cfg['table_element'], (int) $object->id, $allowedEntities);

        $documents = [];
        $dataRootPrefix = rtrim(DOL_DATA_ROOT, '/').'/';
        $sourcePrefix = rtrim($dir, '/').'/';

        foreach ((array) $files as $file) {
            $absPath = (string) ($file['fullname'] ?? '');
            $name = (string) ($file['name'] ?? '');
            if ($absPath === '' || $name === '') {
                continue;
            }
            // Build filepath relative to DOL_DATA_ROOT, exactly like
            // llx_ecm_files stores it.
            $relativeAbsDir = rtrim(dirname($absPath), '/');
            $relPath = $relativeAbsDir;
            if (strpos($relativeAbsDir.'/', $dataRootPrefix) === 0) {
                $relPath = substr($relativeAbsDir, strlen($dataRootPrefix));
            }
            $relPath = rtrim($relPath, '/');
            $key = $relPath.'/'.$name;

            $ecm = isset($ecmIndex[$key]) ? $ecmIndex[$key] : ['ecm_id' => 0, 'share' => ''];
            $mime = function_exists('dol_mimetype') ? dol_mimetype($name) : 'application/octet-stream';
            $size = (int) ($file['size'] ?? 0);
            $date = (int) ($file['date'] ?? 0);

            $documents[] = [
                'ecm_id'        => (int) $ecm['ecm_id'],
                'share'         => (string) $ecm['share'],
                'filename'      => $name,
                'relative_path' => str_replace($sourcePrefix, '', $absPath),
                'mime_type'     => $mime,
                'size'          => $size,
                'date_creation' => $date,
                'date_modification' => $date,
                'object_type'   => $type,
                'object_id'     => (int) $object->id,
            ];
        }

        dol_syslog('DPK DocumentController::list ok type='.$type.' id='.$objectId.' count='.count($documents));

        return [[
            'documents'   => $documents,
            'object_type' => $type,
            'object_id'   => (int) $object->id,
        ], 200];
    }

    /**
     * GET /document/{id}/download
     *
     * Stream the binary content of an ECM-indexed document. The id is the
     * llx_ecm_files.rowid (NOT the source object id). The endpoint:
     *  1. Reads the ecm_files row;
     *  2. Resolves an absolute path inside DOL_DATA_ROOT (path traversal
     *     guard via realpath() + prefix check);
     *  3. Verifies the caller has 'lire' on the originating module by
     *     mapping src_object_type back to a permission group;
     *  4. Streams the binary with Content-Type / Content-Disposition headers.
     *
     * Test mode: when DocumentDownloadRegistry::$skipExit is true, the
     * captured response is stored in DocumentDownloadRegistry::$lastResponse
     * and a synthetic [body, code] tuple is returned so PHPUnit can assert
     * without exit() killing the runner.
     *
     * @param array|null $arr Route params (id) merged by SmartAuth.
     * @return array          [responseBody, httpStatus] on error paths or
     *                        in test mode. On the success path in production
     *                        the function streams + exits and never returns.
     */
    public function download($arr = null)
    {
        global $db, $user, $conf;

        dol_syslog('DPK DocumentController::download');

        $arr = is_array($arr) ? $arr : [];

        if (empty($user) || !is_object($user) || empty($user->id)) {
            dol_syslog('DPK DocumentController::download missing authenticated user', LOG_ERR);
            return [['error' => 'Authentication required'], 401];
        }

        $ecmId = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($ecmId <= 0) {
            dol_syslog('DPK DocumentController::download invalid id='.($arr['id'] ?? 'null'), LOG_ERR);
            return [['error' => 'Invalid id'], 400];
        }

        // ----- Load the ecm_files row -----
        $ecm = new EcmFiles($db);
        $fetched = $ecm->fetch($ecmId);
        if ($fetched <= 0) {
            dol_syslog('DPK DocumentController::download ecm not found id='.$ecmId, LOG_WARNING);
            return [['error' => 'Document not found'], 404];
        }

        // ----- Entity scoping -----
        $rowEntity = (int) ($ecm->entity ?? 0);
        $currentEntity = (int) ($conf->entity ?? 1);
        if ($rowEntity !== 0 && $rowEntity !== $currentEntity) {
            dol_syslog('DPK DocumentController::download entity mismatch row='.$rowEntity.' cur='.$currentEntity, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        // ----- Permission check (map src_object_type -> Dolibarr right) -----
        $tableElement = (string) ($ecm->src_object_type ?? '');
        $perm = $this->permGroupForTableElement($tableElement);
        if ($perm === null) {
            dol_syslog('DPK DocumentController::download unsupported src_object_type='.$tableElement, LOG_WARNING);
            return [['error' => 'Unsupported document type'], 403];
        }
        if (!$this->hasReadRight($user, $perm)) {
            dol_syslog('DPK DocumentController::download forbidden user='.$user->id.' src='.$tableElement, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        // ----- Resolve absolute path inside DOL_DATA_ROOT -----
        $filepath = (string) ($ecm->filepath ?? '');
        $filename = (string) ($ecm->filename ?? '');
        if ($filename === '') {
            dol_syslog('DPK DocumentController::download empty filename for ecm id='.$ecmId, LOG_WARNING);
            return [['error' => 'Filename missing'], 422];
        }

        $rawDataRoot = defined('DOL_DATA_ROOT') ? rtrim((string) DOL_DATA_ROOT, '/') : '';
        $dataRoot = $rawDataRoot;
        if ($rawDataRoot !== '') {
            $resolvedRoot = @realpath($rawDataRoot);
            if ($resolvedRoot !== false) {
                $dataRoot = rtrim($resolvedRoot, '/');
            }
        }

        $candidate = '';
        if ($filepath !== '' && $filepath[0] === '/') {
            // Absolute filepath (rare but valid for legacy rows).
            $candidate = $filepath.'/'.$filename;
        } else {
            $candidate = ($dataRoot !== '' ? $dataRoot.'/' : '').ltrim($filepath, '/').'/'.$filename;
        }
        $real = @realpath($candidate);
        if ($real === false || !is_file($real)) {
            dol_syslog('DPK DocumentController::download orphan path candidate='.$candidate, LOG_WARNING);
            return [['error' => 'Document file no longer exists on disk'], 410];
        }
        if ($dataRoot !== '' && strpos($real, $dataRoot) !== 0) {
            dol_syslog('DPK DocumentController::download outside DOL_DATA_ROOT path='.$real, LOG_WARNING);
            return [['error' => 'Refusing to serve a file outside the document root'], 422];
        }

        $mime = function_exists('dol_mimetype') ? dol_mimetype($filename) : 'application/octet-stream';
        $size = @filesize($real);
        if ($size === false) {
            $size = 0;
        }

        // Conservative filename for Content-Disposition (no quotes, no CRLF).
        $safeName = $filename;
        if (function_exists('dol_sanitizeFileName')) {
            $safeName = dol_sanitizeFileName($filename);
        } else {
            $safeName = preg_replace('/[^A-Za-z0-9._-]/', '_', $filename);
        }
        if ($safeName === '') {
            $safeName = 'document.bin';
        }

        $headers = [
            'Content-Type'           => $mime,
            'Content-Disposition'    => 'attachment; filename="'.$safeName.'"',
            'Content-Length'         => (string) $size,
            'Cache-Control'          => 'private, no-cache, must-revalidate, max-age=0',
            'X-Content-Type-Options' => 'nosniff',
        ];

        dol_syslog('DPK DocumentController::download streaming ecm='.$ecmId.' path='.$real.' size='.$size);

        if (DocumentDownloadRegistry::$skipExit) {
            $body = @file_get_contents($real);
            DocumentDownloadRegistry::$lastResponse = [
                'body'     => $body === false ? '' : $body,
                'code'     => 200,
                'headers'  => $headers,
                'path'     => $real,
                'filename' => $safeName,
            ];
            return [['ok' => true, 'file' => $safeName, 'size' => $size], 200];
        }

        if (!headers_sent()) {
            http_response_code(200);
            foreach ($headers as $name => $value) {
                header($name.': '.$value);
            }
        }
        @readfile($real);
        exit;
    }

    /**
     * Load the llx_ecm_files index for a given (table_element, id) pair,
     * keyed by "filepath/filename" (relative to DOL_DATA_ROOT). Returns
     * an associative array.
     *
     * @param string $tableElement     Value of llx_ecm_files.src_object_type
     * @param int    $objectId         Value of llx_ecm_files.src_object_id
     * @param int[]  $allowedEntities  Entity ids to filter on
     * @return array<string, array{ecm_id:int, share:string}>
     */
    private function loadEcmIndex($tableElement, $objectId, $allowedEntities)
    {
        global $db;

        $index = [];
        if ($tableElement === '' || $objectId <= 0) {
            return $index;
        }
        $entityCsv = implode(',', array_map('intval', $allowedEntities));
        if ($entityCsv === '') {
            return $index;
        }

        $sql = 'SELECT rowid, filename, filepath, share, label, fullpath_orig, date_c'
             . ' FROM '.MAIN_DB_PREFIX.'ecm_files'
             . " WHERE src_object_type = '".$db->escape($tableElement)."'"
             . ' AND src_object_id = '.((int) $objectId)
             . ' AND entity IN ('.$entityCsv.')';

        $res = $db->query($sql);
        if (!$res) {
            return $index;
        }
        while ($row = $db->fetch_object($res)) {
            $filepath = (string) ($row->filepath ?? '');
            $filename = (string) ($row->filename ?? '');
            if ($filename === '') {
                continue;
            }
            $key = $filepath.'/'.$filename;
            $index[$key] = [
                'ecm_id' => (int) $row->rowid,
                'share'  => (string) ($row->share ?? ''),
            ];
        }
        $db->free($res);
        return $index;
    }

    /**
     * Check that the user has the 'lire' right for the given object type
     * config. Mirrors hasAttachPermission() but maps the 'creer' action to
     * 'lire' (or 'commande_lire' / 'facture_lire' for the fournisseur
     * resource which has two-level rights).
     *
     * @param object $user
     * @param array  $cfg
     * @return bool
     */
    private function hasReadPermission($user, $cfg)
    {
        if (!empty($user->admin)) {
            return true;
        }
        $resource = (string) $cfg['perm_resource'];
        $createAction = (string) $cfg['perm_action'];
        if ($resource === '' || $createAction === '') {
            return false;
        }
        // Replace the trailing 'creer' segment with 'lire'. Action shapes are
        // 'creer', 'commande_creer', 'facture_creer', 'myactions_create'.
        $parts = explode('_', $createAction);
        $last = end($parts);
        if ($last === 'creer' || $last === 'create') {
            $parts[count($parts) - 1] = 'lire';
        }
        $readAction = implode('_', $parts);
        $readParts = explode('_', $readAction);
        if (count($readParts) === 1) {
            return (bool) $user->hasRight($resource, $readParts[0]);
        }
        return (bool) $user->hasRight($resource, $readParts[0], $readParts[1]);
    }

    /**
     * Map the llx_ecm_files.src_object_type value back to a Dolibarr
     * permission group descriptor. The download endpoint cannot rely on
     * $objectTypeMap because that map is keyed by PWA object type (propal,
     * order, ...), while ecm_files stores the Dolibarr table element name
     * (propal, commande, facture, commande_fournisseur, invoice_supplier,
     * actioncomm, ...).
     *
     * @param string $tableElement
     * @return array|string|null  Returns a string ('propal', 'commande', ...)
     *                            for single-segment rights, an array
     *                            (['fournisseur','commande']) for two-level
     *                            rights, or null when the type is unknown.
     */
    private function permGroupForTableElement($tableElement)
    {
        $map = [
            'societe'              => 'societe',
            'product'              => 'produit',
            'propal'               => 'propal',
            'commande'             => 'commande',
            'facture'              => 'facture',
            'commande_fournisseur' => ['fournisseur', 'commande'],
            'invoice_supplier'     => ['fournisseur', 'facture'],
            'actioncomm'           => 'agenda',
            'projet'               => 'projet',
            'categorie'            => 'categorie',
        ];
        return $map[$tableElement] ?? null;
    }

    /**
     * Check the 'lire' permission for a permGroup descriptor as returned
     * by permGroupForTableElement().
     *
     * @param object $user
     * @param mixed  $perm  String like 'propal' or ['fournisseur','commande'].
     * @return bool
     */
    private function hasReadRight($user, $perm)
    {
        if (!empty($user->admin)) {
            return true;
        }
        if (is_array($perm) && count($perm) === 2) {
            // Agenda uses 'myactions' subkey for the regular user case.
            if ($perm[0] === 'agenda') {
                if ($user->hasRight('agenda', 'myactions', 'read')) {
                    return true;
                }
                return (bool) $user->hasRight('agenda', 'allactions', 'read');
            }
            return (bool) $user->hasRight($perm[0], $perm[1], 'lire');
        }
        if (is_string($perm)) {
            return (bool) $user->hasRight($perm, 'lire');
        }
        return false;
    }
}
