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
}
