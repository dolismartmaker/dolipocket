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

dol_include_once('/contact/class/contact.class.php');
dol_include_once('/dolipocket/smartmaker-api/dmContact.php');
dol_include_once('/dolipocket/smartmaker-api/VCardHelper.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');

use Contact;
use Dolipocket\Api\Trait\PaginatedListTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * REST controller for the Contacts module of Dolipocket.
 *
 * Filtering by entity is delegated to Dolibarr core via getEntity('societe')
 * (Contact rows live in llx_socpeople which uses the 'societe' entity scope).
 */
class ContactController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'sp.lastname ASC, sp.firstname ASC, sp.rowid ASC';

    /**
     * Mapper instance used for export and metadata.
     *
     * The mapper exposes the column catalog via dmCatalogTrait::getColumnCatalog()
     * which is the single source of truth for filter/sort whitelists in v2.
     *
     * @var dmContact
     */
    private $mapper;

    /**
     * Constructor
     */
    public function __construct()
    {
        $this->mapper = new dmContact();
    }

    /**
     * GET contact
     *
     * Two response shapes (cf DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (when no DataTable list params are present).
     *     Keeps the historical 'socid' / 'q' / 'page' / 'limit' query
     *     semantics intact for the existing PWA pages.
     *   - Paginated envelope {items, total, page, limit} when at least one
     *     of search / filter[*] / sort / page / limit is provided.
     *
     * @param   array|null  $arr  Query parameters
     * @return  array              [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::index access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."socpeople as sp";
        $baseWhere = " WHERE sp.entity IN (".getEntity('societe').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'sp');
        $where = $baseWhere.$filterWhere;

        $countSql = "SELECT COUNT(sp.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ContactController::index count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'sp', self::$defaultSort);
        $sql = "SELECT sp.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ContactController::index page SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $c = new Contact($db);
            if ($c->fetch((int) $obj->rowid) > 0) {
                $c->fetch_optionals();
                $items[] = $this->mapper->exportMappedDataFiltered($c, $includeKeys);
            }
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET contact/columns
     *
     * Returns the normalized column catalog for the DataTable consumer
     * (cf docs/DATATABLE_SPEC.md section 13).
     *
     * @param   array|null  $arr  Unused.
     * @return  array              [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::columns access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET contact/describe
     *
     * Returns the raw objectDesc() output (per-field metadata) for AutoForm.
     * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
     *
     * @param  array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::describe access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * Parse the optional ?include=col1,col2,... query parameter into a
     * whitelist of appside keys. Returns null when absent.
     *
     * @param   array|null $arr
     * @return  array<int,string>|null
     */
    private function parseIncludeKeys($arr)
    {
        if (!is_array($arr) || empty($arr['include'])) {
            return null;
        }
        $raw = (string) $arr['include'];
        $keys = [];
        foreach (explode(',', $raw) as $k) {
            $k = trim($k);
            if ($k !== '') {
                $keys[] = $k;
            }
        }
        return empty($keys) ? null : $keys;
    }

    /**
     * Legacy index handler kept for backward compatibility with the existing
     * PWA pages that call useDbContacts.list({}) with the historical query
     * parameters.
     *
     * @param   array|null  $arr
     * @return  array              [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : null;
        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';
        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(100, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;

        $sql = "SELECT sp.rowid";
        $sql .= " FROM ".MAIN_DB_PREFIX."socpeople as sp";
        $sql .= " WHERE sp.entity IN (".getEntity('societe').")";

        if ($socid !== null && $socid > 0) {
            $sql .= " AND sp.fk_soc = ".$socid;
        }

        if ($q !== '') {
            $like = '%'.$db->escape($q).'%';
            $sql .= " AND (sp.lastname LIKE '".$like."'";
            $sql .= " OR sp.firstname LIKE '".$like."'";
            $sql .= " OR sp.email LIKE '".$like."'";
            $sql .= " OR sp.phone LIKE '".$like."'";
            $sql .= " OR sp.phone_mobile LIKE '".$like."')";
        }

        $sql .= " ORDER BY sp.lastname ASC, sp.firstname ASC";
        $sql .= $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ContactController::indexLegacy SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $c = new Contact($db);
            if ($c->fetch((int) $obj->rowid) > 0) {
                $c->fetch_optionals();
                $items[] = $this->mapper->exportMappedData($c);
            }
        }
        $db->free($resql);

        return [[
            'items' => $items,
            'page'  => $page,
            'limit' => $limit,
        ], 200];
    }

    /**
     * GET contact/count
     *
     * Returns {total: N} matching the current filters and global search.
     *
     * @param   array|null  $arr  Query parameters (search, filter[...]).
     * @return  array              [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::count access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'sp');

        $sql = "SELECT COUNT(sp.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."socpeople as sp";
        $sql .= " WHERE sp.entity IN (".getEntity('societe').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ContactController::count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE contact (bulk)
     *
     * Body: { ids: [1, 2, ...] }, max 100.
     * Each id is attempted independently. Returns
     * {success: [...ids], errors: [{id, reason}, ...]}.
     *
     * @param   array|null  $arr  Body payload.
     * @return  array              [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'supprimer') && !$user->hasRight('societe', 'supprimer')) {
            dol_syslog("DPK ContactController::deleteBulk access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK ContactController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
            return [['error' => "Body must include an 'ids' array of integers"], 400];
        }

        $ids = [];
        foreach ($rawIds as $id) {
            $idInt = (int) $id;
            if ($idInt > 0) {
                $ids[] = $idInt;
            }
        }
        $ids = array_values(array_unique($ids));

        if (empty($ids)) {
            dol_syslog("DPK ContactController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK ContactController::deleteBulk too many ids: ".count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $c = new Contact($db);
            $res = $c->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK ContactController::deleteBulk contact not found id=".$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Contact not found'];
                continue;
            }

            // Contact::delete() takes notrigger as argument; the user is global.
            $resDel = $c->delete(0);
            if ($resDel <= 0) {
                $reason = $c->error !== '' ? $c->error : 'Failed to delete';
                dol_syslog("DPK ContactController::deleteBulk failed id=".$id.": ".$reason, LOG_ERR);
                $errors[] = ['id' => $id, 'reason' => $reason];
                continue;
            }

            $success[] = $id;
        }

        return [
            ['success' => $success, 'errors' => $errors],
            200,
        ];
    }

    /**
     * GET contact/{id}
     *
     * @param   array|null  $arr  Route parameters (id)
     * @return  array              [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::show access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ContactController::show missing id", LOG_WARNING);
            return [['error' => 'Contact id is required'], 400];
        }

        $id = (int) $arr['id'];
        $c = new Contact($db);
        $res = $c->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ContactController::show contact not found id=".$id, LOG_WARNING);
            return [['error' => 'Contact not found'], 404];
        }

        $c->fetch_optionals();
        return [$this->mapper->exportMappedData($c), 200];
    }

    /**
     * POST contact
     *
     * @param   array|null  $arr  Request body
     * @return  array              [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'creer') && !$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ContactController::create access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['lastname']) && empty($arr['firstname'])) {
            dol_syslog("DPK ContactController::create missing lastname/firstname", LOG_WARNING);
            return [['error' => 'Lastname or firstname is required'], 400];
        }

        $c = new Contact($db);
        $this->applyPayload($c, $arr);

        $res = $c->create($user);
        if ($res <= 0) {
            dol_syslog("DPK ContactController::create failed: ".$c->error, LOG_ERR);
            return [['error' => 'Failed to create contact: '.$c->error], 500];
        }

        if ($this->applyExtrafields($c, $arr)) {
            $efRes = $c->insertExtraFields();
            if ($efRes < 0) {
                dol_syslog("DPK ContactController::create insertExtraFields failed: ".$c->error, LOG_ERR);
                return [['error' => 'Failed to set extrafields: '.$c->error], 500];
            }
        }

        $c->fetch($res);
        $c->fetch_optionals();
        return [$this->mapper->exportMappedData($c), 201];
    }

    /**
     * PUT contact/{id}
     *
     * @param   array|null  $arr  Route parameters (id) and request body
     * @return  array              [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'creer') && !$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ContactController::update access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ContactController::update missing id", LOG_WARNING);
            return [['error' => 'Contact id is required'], 400];
        }

        $id = (int) $arr['id'];
        $c = new Contact($db);
        $res = $c->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ContactController::update contact not found id=".$id, LOG_WARNING);
            return [['error' => 'Contact not found'], 404];
        }

        $c->fetch_optionals();

        // Split the payload: options_* keys go to applyExtrafields()
        // (unchanged path), every other key flows through importMappedData()
        // on the native side.
        $payloadNative = [];
        $payloadExtra = [];
        foreach ($arr as $k => $v) {
            if ($k === 'id') {
                continue;
            }
            if (is_string($k) && strpos($k, 'options_') === 0) {
                $payloadExtra[$k] = $v;
            } else {
                $payloadNative[$k] = $v;
            }
        }

        try {
            $sanitized = $this->mapper->importMappedData($payloadNative);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK ContactController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk: API civility maps to $c->civility_code (the SQL property);
            // the legacy $c->civility_id mirror is kept for any code path
            // that still reads it.
            if ($field === 'civility_code') {
                $c->civility_code = $value;
                $c->civility_id = $value;
                continue;
            }
            // Quirk: fk_soc sets both $c->socid AND $c->fk_soc.
            if ($field === 'fk_soc') {
                $c->socid = $value;
                $c->fk_soc = $value;
                continue;
            }
            $c->$field = $value;
        }

        $res = $c->update($id, $user);
        if ($res < 0) {
            dol_syslog("DPK ContactController::update failed: ".$c->error, LOG_ERR);
            return [['error' => 'Failed to update contact: '.$c->error], 500];
        }

        if ($this->applyExtrafields($c, $payloadExtra)) {
            $efRes = $c->insertExtraFields();
            if ($efRes < 0) {
                dol_syslog("DPK ContactController::update insertExtraFields failed: ".$c->error, LOG_ERR);
                return [['error' => 'Failed to set extrafields: '.$c->error], 500];
            }
        }

        $c->fetch($id);
        $c->fetch_optionals();
        return [$this->mapper->exportMappedData($c), 200];
    }

    /**
     * DELETE contact/{id}
     *
     * @param   array|null  $arr  Route parameters (id)
     * @return  array              [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'supprimer') && !$user->hasRight('societe', 'supprimer')) {
            dol_syslog("DPK ContactController::delete access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ContactController::delete missing id", LOG_WARNING);
            return [['error' => 'Contact id is required'], 400];
        }

        $id = (int) $arr['id'];
        $c = new Contact($db);
        $res = $c->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ContactController::delete contact not found id=".$id, LOG_WARNING);
            return [['error' => 'Contact not found'], 404];
        }

        // Contact::delete() takes notrigger as argument; the user is global
        $res = $c->delete(0);
        if ($res <= 0) {
            dol_syslog("DPK ContactController::delete failed: ".$c->error, LOG_ERR);
            return [['error' => 'Failed to delete contact: '.$c->error], 500];
        }

        return [['message' => 'Contact deleted'], 200];
    }

    /**
     * Apply scalar fields from API payload onto a Contact instance.
     *
     * @param   Contact  $c    Target Contact
     * @param   array    $arr  Input payload
     * @return  void
     */
    private function applyPayload(Contact $c, array $arr)
    {
        if (isset($arr['lastname'])) {
            $c->lastname = (string) $arr['lastname'];
        }
        if (isset($arr['firstname'])) {
            $c->firstname = (string) $arr['firstname'];
        }
        if (isset($arr['civility'])) {
            $c->civility_code = (string) $arr['civility'];
            $c->civility_id = (string) $arr['civility'];
        }
        if (isset($arr['fk_soc'])) {
            $c->socid = !empty($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0;
            $c->fk_soc = $c->socid;
        }
        if (isset($arr['address'])) {
            $c->address = (string) $arr['address'];
        }
        if (isset($arr['zip'])) {
            $c->zip = (string) $arr['zip'];
        }
        if (isset($arr['town'])) {
            $c->town = (string) $arr['town'];
        }
        if (isset($arr['country_code'])) {
            $c->country_code = (string) $arr['country_code'];
        }
        if (isset($arr['phone_pro'])) {
            $c->phone_pro = (string) $arr['phone_pro'];
        }
        if (isset($arr['phone_mobile'])) {
            $c->phone_mobile = (string) $arr['phone_mobile'];
        }
        if (isset($arr['fax'])) {
            $c->fax = (string) $arr['fax'];
        }
        if (isset($arr['email'])) {
            $c->email = (string) $arr['email'];
        }
        if (isset($arr['statut'])) {
            $c->statut = (int) $arr['statut'];
        }
        if (isset($arr['poste'])) {
            $c->poste = (string) $arr['poste'];
        }
        if (isset($arr['note_public'])) {
            $c->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $c->note_private = (string) $arr['note_private'];
        }
    }

    /**
     * Copy any 'options_*' keys from the payload into $c->array_options.
     *
     * @param   Contact  $c    Target Contact
     * @param   array    $arr  Input payload
     * @return  bool           True if at least one extrafield was set
     */
    private function applyExtrafields(Contact $c, array $arr)
    {
        $touched = false;
        foreach ($arr as $key => $value) {
            if (strpos((string) $key, 'options_') === 0) {
                if (!is_array($c->array_options)) {
                    $c->array_options = [];
                }
                $c->array_options[$key] = $value;
                $touched = true;
            }
        }
        return $touched;
    }

    /**
     * GET contact/export/vcard
     *
     * Export one or more contacts as vCard format.
     * Query params:
     *   - ids: comma-separated list of contact IDs (optional, exports all if absent)
     *
     * @param   array|null  $arr  Query parameters
     * @return  array              [data, httpCode]
     */
    public function exportVCard($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'lire') && !$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ContactController::exportVCard access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $ids = [];
        if (!empty($arr['ids'])) {
            $idsParts = explode(',', (string) $arr['ids']);
            foreach ($idsParts as $idStr) {
                $idInt = (int) trim($idStr);
                if ($idInt > 0) {
                    $ids[] = $idInt;
                }
            }
        }

        // Build query
        $sql = "SELECT sp.rowid FROM ".MAIN_DB_PREFIX."socpeople as sp";
        $sql .= " WHERE sp.entity IN (".getEntity('societe').")";

        if (!empty($ids)) {
            $sql .= " AND sp.rowid IN (".implode(',', $ids).")";
        }

        $sql .= " ORDER BY sp.lastname ASC, sp.firstname ASC";

        // Limit to 500 contacts max for safety
        $sql .= $db->plimit(500, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ContactController::exportVCard SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $contacts = [];
        while ($obj = $db->fetch_object($resql)) {
            $c = new Contact($db);
            if ($c->fetch((int) $obj->rowid) > 0) {
                $contacts[] = $c;
            }
        }
        $db->free($resql);

        if (empty($contacts)) {
            dol_syslog("DPK ContactController::exportVCard no contacts found", LOG_WARNING);
            return [['error' => 'No contacts found'], 404];
        }

        // Generate vCard content
        $vcardContent = VCardHelper::contactsToVCard($contacts);

        // Generate filename
        if (count($contacts) === 1) {
            $c = $contacts[0];
            $filename = preg_replace('/[^a-zA-Z0-9_-]/', '_', trim($c->firstname.'_'.$c->lastname)).'.vcf';
        } else {
            $filename = 'contacts_export_'.date('Y-m-d').'.vcf';
        }

        return [[
            'content' => base64_encode($vcardContent),
            'content-type' => 'text/vcard',
            'filename' => $filename,
        ], 200];
    }

    /**
     * POST contact/import/vcard
     *
     * Import contacts from a vCard file.
     * Request body:
     *   - content: base64-encoded vCard file content
     *   - mode: 'preview' (default) or 'import'
     *   - fk_soc: optional default company ID for imported contacts
     *
     * @param   array|null  $arr  Request body
     * @return  array              [data, httpCode]
     */
    public function importVCard($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'contact', 'creer') && !$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ContactController::importVCard access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['content'])) {
            dol_syslog("DPK ContactController::importVCard missing content", LOG_WARNING);
            return [['error' => 'vCard content is required'], 400];
        }

        $content = base64_decode((string) $arr['content']);
        if ($content === false) {
            dol_syslog("DPK ContactController::importVCard invalid base64", LOG_WARNING);
            return [['error' => 'Invalid base64 content'], 400];
        }

        $mode = isset($arr['mode']) ? (string) $arr['mode'] : 'preview';
        $defaultSocId = isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0;

        // Parse vCard
        $parsed = VCardHelper::parseVCard($content);

        if (empty($parsed)) {
            dol_syslog("DPK ContactController::importVCard no contacts found in vCard", LOG_WARNING);
            return [['error' => 'No valid contacts found in vCard'], 400];
        }

        // Preview mode: just return parsed data
        if ($mode === 'preview') {
            return [[
                'contacts' => $parsed,
                'count' => count($parsed),
            ], 200];
        }

        // Import mode: create contacts
        $created = [];
        $errors = [];

        foreach ($parsed as $index => $contactData) {
            $c = new Contact($db);
            $c->lastname = $contactData['lastname'] ?? '';
            $c->firstname = $contactData['firstname'] ?? '';
            $c->civility_code = $contactData['civility'] ?? '';
            $c->email = $contactData['email'] ?? '';
            $c->phone_pro = $contactData['phone_pro'] ?? '';
            $c->phone_mobile = $contactData['phone_mobile'] ?? '';
            $c->fax = $contactData['fax'] ?? '';
            $c->address = $contactData['address'] ?? '';
            $c->zip = $contactData['zip'] ?? '';
            $c->town = $contactData['town'] ?? '';
            $c->country_code = $contactData['country_code'] ?? '';
            $c->poste = $contactData['poste'] ?? '';
            $c->note_public = $contactData['note_public'] ?? '';

            if ($defaultSocId > 0) {
                $c->socid = $defaultSocId;
                $c->fk_soc = $defaultSocId;
            }

            $res = $c->create($user);
            if ($res > 0) {
                $c->fetch($res);
                $c->fetch_optionals();
                $created[] = $this->mapper->exportMappedData($c);
            } else {
                $errors[] = [
                    'index' => $index,
                    'name' => trim($contactData['firstname'].' '.$contactData['lastname']),
                    'error' => $c->error ?: 'Unknown error',
                ];
                dol_syslog("DPK ContactController::importVCard failed to create contact: ".$c->error, LOG_ERR);
            }
        }

        return [[
            'created' => $created,
            'created_count' => count($created),
            'errors' => $errors,
            'error_count' => count($errors),
        ], 200];
    }
}
