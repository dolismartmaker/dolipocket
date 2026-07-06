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

dol_include_once('/societe/class/societe.class.php');
dol_include_once('/dolipocket/smartmaker-api/dmThirdParty.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/SendEmailTrait.php');

use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\SendEmailMailerRegistry;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * REST controller for the Tiers (Societe) module of Dolipocket.
 *
 * All routes implicitly run inside the entity of the authenticated user
 * because Dolibarr's getEntity('societe') already filters by $conf->entity.
 */
class ThirdPartyController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 's.nom ASC, s.rowid ASC';

    /**
     * Mapper instance used for export and metadata.
     *
     * The mapper exposes the column catalog via dmCatalogTrait::getColumnCatalog()
     * which is the single source of truth for filter/sort whitelists in v2.
     *
     * @var dmThirdParty
     */
    private $mapper;

    /**
     * Constructor. Boots the mapper (extrafields configuration is read here).
     */
    public function __construct()
    {
        $this->mapper = new dmThirdParty();
    }

    /**
     * GET thirdparty
     *
     * List third parties.
     *
     * Two response shapes:
     *   - Legacy raw array (when no DataTable list params are present, cf
     *     DATATABLE_SPEC.md section 4.3). The legacy 'q', 'client',
     *     'fournisseur', 'page', 'limit' query params still work to keep
     *     the existing PWA pages compatible.
     *   - Paginated envelope {items, total, page, limit} when at least one
     *     of search/filter/sort/page/limit is provided.
     *
     * @param   array|null  $arr  Query parameters
     * @return  array              [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::index access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $useDataTable = $this->hasListParams($arr);

        // Legacy path: keep the previous behaviour bit-for-bit so existing
        // PWA callers (useDbThirdParties.list({})) keep working.
        if (!$useDataTable) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);

        // Optional include= CSV: restrict the export to a subset of appside keys.
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."societe as s";
        $baseWhere = " WHERE s.entity IN (".getEntity('societe').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 's');
        $where = $baseWhere.$filterWhere;

        // Total count for the response envelope.
        $countSql = "SELECT COUNT(s.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ThirdPartyController::index count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        // Page of rowids.
        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 's', self::$defaultSort);
        $sql = "SELECT s.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ThirdPartyController::index page SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $tp = new Societe($db);
            if ($tp->fetch((int) $obj->rowid) > 0) {
                $tp->fetch_optionals();
                $items[] = $this->mapper->exportMappedDataFiltered($tp, $includeKeys);
            }
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET thirdparty/columns
     *
     * Returns the normalized column catalog for the DataTable consumer
     * (cf docs/DATATABLE_SPEC.md section 13). Cacheable client-side via
     * localStorage; the catalog rarely changes.
     *
     * @param   array|null  $arr  Unused (no params).
     * @return  array              [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::columns access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET thirdparty/describe
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

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::describe access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * Parse the optional ?include=col1,col2,... query parameter into a
     * whitelist of appside keys. Returns null when absent so callers know
     * to keep the full export.
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
     * Legacy index handler: returns a raw array, keeps the historical
     * 'q' / 'client' / 'fournisseur' / 'page' / 'limit' query semantics so
     * existing PWA callers keep working untouched.
     *
     * @param   array|null  $arr
     * @return  array              [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';
        $client = isset($arr['client']) ? (int) $arr['client'] : null;
        $fournisseur = isset($arr['fournisseur']) ? (int) $arr['fournisseur'] : null;
        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(100, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;

        $sql = "SELECT s.rowid";
        $sql .= " FROM ".MAIN_DB_PREFIX."societe as s";
        $sql .= " WHERE s.entity IN (".getEntity('societe').")";

        if ($client !== null) {
            // Dolibarr stores client codes as: 0=none, 1=customer, 2=prospect, 3=customer+prospect
            if ($client === 1) {
                $sql .= " AND s.client IN (1, 2, 3)";
            } else {
                $sql .= " AND s.client = 0";
            }
        }

        if ($fournisseur !== null) {
            if ($fournisseur === 1) {
                $sql .= " AND s.fournisseur = 1";
            } else {
                $sql .= " AND s.fournisseur = 0";
            }
        }

        if ($q !== '') {
            $like = '%'.$db->escape($q).'%';
            $sql .= " AND (s.nom LIKE '".$like."'";
            $sql .= " OR s.name_alias LIKE '".$like."'";
            $sql .= " OR s.email LIKE '".$like."'";
            $sql .= " OR s.code_client LIKE '".$like."'";
            $sql .= " OR s.code_fournisseur LIKE '".$like."')";
        }

        $sql .= " ORDER BY s.nom ASC";
        $sql .= $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ThirdPartyController::indexLegacy SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $tp = new Societe($db);
            if ($tp->fetch((int) $obj->rowid) > 0) {
                $tp->fetch_optionals();
                $items[] = $this->mapper->exportMappedData($tp);
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
     * GET thirdparty/count
     *
     * Returns {total: N} matching the current filters and global search.
     * Used by the DataTable to decide between client-side mode A and
     * server-side mode B (cf DATATABLE_SPEC.md section 3.1).
     *
     * @param   array|null  $arr  Query parameters (search, filter[...]).
     * @return  array              [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::count access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 's');

        $sql = "SELECT COUNT(s.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."societe as s";
        $sql .= " WHERE s.entity IN (".getEntity('societe').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ThirdPartyController::count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE thirdparty (bulk)
     *
     * Body: { ids: [1, 2, 3, ...] }, max 100.
     * Returns {success: [...ids], errors: [{id, reason}, ...]}.
     *
     * Each id is attempted independently: a partial failure does not roll
     * back the successful deletions (cf DATATABLE_SPEC.md section 4.5).
     *
     * @param   array|null  $arr  Body payload.
     * @return  array              [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'supprimer')) {
            dol_syslog("DPK ThirdPartyController::deleteBulk access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK ThirdPartyController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK ThirdPartyController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK ThirdPartyController::deleteBulk too many ids: ".count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $tp = new Societe($db);
            $res = $tp->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK ThirdPartyController::deleteBulk thirdparty not found id=".$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Thirdparty not found'];
                continue;
            }

            $resDel = $tp->delete($id, $user);
            if ($resDel <= 0) {
                $reason = $tp->error !== '' ? $tp->error : 'Failed to delete';
                dol_syslog("DPK ThirdPartyController::deleteBulk failed id=".$id.": ".$reason, LOG_ERR);
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
     * GET thirdparty/{id}
     *
     * @param   array|null  $arr  Route parameters (id)
     * @return  array              [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::show access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ThirdPartyController::show missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $id = (int) $arr['id'];
        $tp = new Societe($db);
        $res = $tp->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::show thirdparty not found id=".$id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        $tp->fetch_optionals();
        return [$this->mapper->exportMappedData($tp), 200];
    }

    /**
     * POST thirdparty
     *
     * @param   array|null  $arr  Request body
     * @return  array              [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::create access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['name'])) {
            dol_syslog("DPK ThirdPartyController::create missing name", LOG_WARNING);
            return [['error' => 'Name is required'], 400];
        }

        $tp = new Societe($db);
        $this->applyPayload($tp, $arr);

        // Default flags so the row passes Dolibarr validation
        if (!isset($arr['client']) && !isset($arr['fournisseur'])) {
            $tp->client = 1; // customer by default
            $tp->fournisseur = 0;
        }

        $res = $tp->create($user);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::create failed: ".$tp->error, LOG_ERR);
            return [['error' => 'Failed to create thirdparty: '.$tp->error], 500];
        }

        // Persist extrafields submitted via 'options_*' keys
        if ($this->applyExtrafields($tp, $arr)) {
            $efRes = $tp->insertExtraFields();
            if ($efRes < 0) {
                dol_syslog("DPK ThirdPartyController::create insertExtraFields failed: ".$tp->error, LOG_ERR);
                return [['error' => 'Failed to set extrafields: '.$tp->error], 500];
            }
        }

        $tp->fetch($res);
        $tp->fetch_optionals();
        return [$this->mapper->exportMappedData($tp), 201];
    }

    /**
     * PUT thirdparty/{id}
     *
     * @param   array|null  $arr  Route parameters (id) and request body
     * @return  array              [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::update access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ThirdPartyController::update missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $id = (int) $arr['id'];
        $tp = new Societe($db);
        $res = $tp->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::update thirdparty not found id=".$id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        $tp->fetch_optionals();

        // Split the payload between native fields (handled by the mapper)
        // and extrafields (still routed through applyExtrafields in v1).
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
            dol_syslog("DPK ThirdPartyController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk: the Dolibarr SQL column is `nom` but Societe::update()
            // reads $this->name (then mirrors back to $this->nom for BC).
            if ($field === 'nom') {
                $tp->name = $value;
                continue;
            }
            // Quirk: siren / siret / ape are stored on $this->idprof1/2/3
            // (cf societe.class.php:1470 -- UPDATE writes `siren = idprof1`).
            // We keep the legacy double-assignment so any other code path
            // reading $this->siren / $this->siret / $this->ape still works.
            if ($field === 'siren') {
                $tp->idprof1 = $value;
                $tp->siren = $value;
                continue;
            }
            if ($field === 'siret') {
                $tp->idprof2 = $value;
                $tp->siret = $value;
                continue;
            }
            if ($field === 'ape') {
                $tp->idprof3 = $value;
                $tp->ape = $value;
                continue;
            }
            $tp->$field = $value;
        }

        $res = $tp->update($id, $user);
        if ($res < 0) {
            dol_syslog("DPK ThirdPartyController::update failed: ".$tp->error, LOG_ERR);
            return [['error' => 'Failed to update thirdparty: '.$tp->error], 500];
        }

        if ($this->applyExtrafields($tp, $payloadExtra)) {
            $efRes = $tp->insertExtraFields();
            if ($efRes < 0) {
                dol_syslog("DPK ThirdPartyController::update insertExtraFields failed: ".$tp->error, LOG_ERR);
                return [['error' => 'Failed to set extrafields: '.$tp->error], 500];
            }
        }

        $tp->fetch($id);
        $tp->fetch_optionals();
        return [$this->mapper->exportMappedData($tp), 200];
    }

    /**
     * DELETE thirdparty/{id}
     *
     * @param   array|null  $arr  Route parameters (id)
     * @return  array              [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'supprimer')) {
            dol_syslog("DPK ThirdPartyController::delete access denied for user ".((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ThirdPartyController::delete missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $id = (int) $arr['id'];
        $tp = new Societe($db);
        $res = $tp->fetch($id);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::delete thirdparty not found id=".$id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        $res = $tp->delete($id, $user);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::delete failed: ".$tp->error, LOG_ERR);
            return [['error' => 'Failed to delete thirdparty: '.$tp->error], 500];
        }

        return [['message' => 'Thirdparty deleted'], 200];
    }

    /**
     * GET thirdparty/{id}/categories -- assigned + available customer/supplier
     * tags (Dolibarr "Tags/categories" of a thirdparty).
     *
     * @param array|null $arr
     * @return array
     */
    public function categories($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::categories forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::categories missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::categories not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $assigned = array();
        $available = array();
        foreach (array('customer', 'supplier') as $type) {
            $cat = new \Categorie($db);
            $cur = $cat->containing($id, $type, 'object');
            if (is_array($cur)) {
                foreach ($cur as $c) {
                    $assigned[] = array('id' => (int) $c->id, 'label' => $c->label, 'type' => $type);
                }
            }
            $arbo = $cat->get_full_arbo($type);
            if (is_array($arbo)) {
                foreach ($arbo as $a) {
                    $label = !empty($a['fulllabel']) ? $a['fulllabel'] : (isset($a['label']) ? $a['label'] : '');
                    $available[] = array('id' => (int) $a['id'], 'label' => $label, 'type' => $type);
                }
            }
        }

        return [['assigned' => $assigned, 'available' => $available], 200];
    }

    /**
     * POST thirdparty/{id}/category -- assign a tag. Body: category_id (int),
     * type ('customer' default | 'supplier').
     *
     * @param array|null $arr
     * @return array
     */
    public function categoryAdd($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::categoryAdd forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $catId = isset($arr['category_id']) ? (int) $arr['category_id'] : 0;
        $type = (isset($arr['type']) && $arr['type'] === 'supplier') ? 'supplier' : 'customer';
        if ($id <= 0 || $catId <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryAdd missing id/category_id", LOG_WARNING);
            return [['error' => 'Thirdparty id and category_id are required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryAdd thirdparty not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $cat = new \Categorie($db);
        if ($cat->fetch($catId) <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryAdd category not found id=" . $catId, LOG_WARNING);
            return [['error' => 'Category not found'], 404];
        }

        $res = $cat->add_type($tp, $type);
        if ($res < 0) {
            dol_syslog("DPK ThirdPartyController::categoryAdd add_type() failed: " . $cat->error, LOG_ERR);
            return [['error' => 'Failed to assign category: ' . $cat->error], 500];
        }

        return $this->categories(['id' => $id]);
    }

    /**
     * DELETE thirdparty/{id}/category/{categoryId} -- unassign a tag. Optional
     * 'type' (defaults to customer; both map to the same link table).
     *
     * @param array|null $arr
     * @return array
     */
    public function categoryRemove($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::categoryRemove forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $catId = isset($arr['categoryId']) ? (int) $arr['categoryId'] : 0;
        $type = (isset($arr['type']) && $arr['type'] === 'supplier') ? 'supplier' : 'customer';
        if ($id <= 0 || $catId <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryRemove missing id/categoryId", LOG_WARNING);
            return [['error' => 'Thirdparty id and categoryId are required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryRemove thirdparty not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $cat = new \Categorie($db);
        if ($cat->fetch($catId) <= 0) {
            dol_syslog("DPK ThirdPartyController::categoryRemove category not found id=" . $catId, LOG_WARNING);
            return [['error' => 'Category not found'], 404];
        }

        $res = $cat->del_type($tp, $type);
        if ($res < 0) {
            dol_syslog("DPK ThirdPartyController::categoryRemove del_type() failed: " . $cat->error, LOG_ERR);
            return [['error' => 'Failed to unassign category: ' . $cat->error], 500];
        }

        return $this->categories(['id' => $id]);
    }

    /**
     * GET thirdparty/{id}/bankaccounts -- list the thirdparty bank accounts
     * (Dolibarr "RIB/IBAN" tab).
     *
     * @param array|null $arr
     * @return array
     */
    public function bankAccounts($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::bankAccounts forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccounts missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccounts not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/societe/class/companybankaccount.class.php';
        $accounts = array();
        $sql = "SELECT rowid FROM " . MAIN_DB_PREFIX . "societe_rib WHERE fk_soc = " . ((int) $id) . " AND type = 'ban' ORDER BY rowid";
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $acc = new \CompanyBankAccount($db);
                if ($acc->fetch($obj->rowid) > 0) {
                    $accounts[] = array(
                        'id'         => (int) $acc->id,
                        'label'      => $acc->label,
                        'bank'       => $acc->bank,
                        'iban'       => $acc->iban,
                        'bic'        => $acc->bic,
                        'ownerName'  => $acc->proprio,
                        'rum'        => $acc->rum,
                        'defaultRib' => (int) $acc->default_rib,
                    );
                }
            }
        } else {
            dol_syslog("DPK ThirdPartyController::bankAccounts query failed: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list bank accounts'], 500];
        }

        return [['accounts' => $accounts], 200];
    }

    /**
     * POST thirdparty/{id}/bankaccount -- add a bank account. Body: label,
     * bank, iban, bic, owner_name (all optional strings).
     *
     * @param array|null $arr
     * @return array
     */
    public function bankAccountAdd($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::bankAccountAdd forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountAdd missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountAdd thirdparty not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/societe/class/companybankaccount.class.php';
        $acc = new \CompanyBankAccount($db);
        $acc->socid = $id;
        $acc->type = 'ban';
        $acc->label = isset($arr['label']) ? (string) $arr['label'] : '';
        $acc->bank = isset($arr['bank']) ? (string) $arr['bank'] : '';
        $acc->iban = isset($arr['iban']) ? (string) $arr['iban'] : '';
        $acc->bic = isset($arr['bic']) ? (string) $arr['bic'] : '';
        $acc->proprio = isset($arr['owner_name']) ? (string) $arr['owner_name'] : '';

        $res = $acc->create($user);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountAdd create() failed: " . $acc->error, LOG_ERR);
            return [['error' => 'Failed to add bank account: ' . $acc->error], 500];
        }

        return $this->bankAccounts(['id' => $id]);
    }

    /**
     * DELETE thirdparty/{id}/bankaccount/{accountId} -- remove a bank account.
     *
     * @param array|null $arr
     * @return array
     */
    public function bankAccountRemove($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'creer')) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $accId = isset($arr['accountId']) ? (int) $arr['accountId'] : 0;
        if ($id <= 0 || $accId <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove missing id/accountId", LOG_WARNING);
            return [['error' => 'Thirdparty id and accountId are required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove thirdparty not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/societe/class/companybankaccount.class.php';
        $acc = new \CompanyBankAccount($db);
        if ($acc->fetch($accId) <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove account not found id=" . $accId, LOG_WARNING);
            return [['error' => 'Bank account not found'], 404];
        }
        // Tenant isolation: the account must belong to the resolved thirdparty
        // (itself fetched under the current entity).
        if ((int) $acc->socid !== $id) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove account socid mismatch acc=" . $accId, LOG_WARNING);
            return [['error' => 'Bank account does not belong to this thirdparty'], 403];
        }

        $res = $acc->delete($user);
        if ($res <= 0) {
            dol_syslog("DPK ThirdPartyController::bankAccountRemove delete() failed: " . $acc->error, LOG_ERR);
            return [['error' => 'Failed to remove bank account: ' . $acc->error], 500];
        }

        return $this->bankAccounts(['id' => $id]);
    }

    /**
     * GET thirdparty/{id}/discounts -- Tier A lot A5c.
     *
     * List the reusable absolute discounts (DiscountAbsolute / societe_remise_except)
     * currently AVAILABLE (not yet consumed) for this thirdparty. Each row is
     * tagged with an apply mode that mirrors Dolibarr's two discount forms
     * (core/tpl/object_discounts.tpl.php + compta/facture/card.php lines
     * 4108-4109, default config):
     *   - 'line'    : pure discounts and deposits -> applied as a NEGATIVE line
     *                 on a DRAFT invoice (POST invoice/{id}/discount).
     *   - 'payment' : credit notes and excess-received -> applied as a PAYMENT
     *                 on a VALIDATED unpaid invoice (POST invoice/{id}/usecreditnote).
     * The line/payment split is the exact $filterabsolutediscount /
     * $filtercreditnote predicate: line = (no source invoice) OR (deposit and not
     * excess); payment = (has source invoice) AND (not deposit OR excess).
     *
     * @param array|null $arr
     * @return array
     */
    public function discounts($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::discounts forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::discounts missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::discounts not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        // Available customer discounts only (discount_type = 0), not yet consumed
        // (fk_facture IS NULL AND fk_facture_line IS NULL), within the tenant
        // entity (getEntity('invoice') as DiscountAbsolute::fetch uses).
        $sql = "SELECT re.rowid, re.amount_ht, re.amount_tva, re.amount_ttc, re.tva_tx,";
        $sql .= " re.description, re.fk_facture_source, re.datec,";
        $sql .= " f.ref as ref_source";
        $sql .= " FROM " . MAIN_DB_PREFIX . "societe_remise_except as re";
        $sql .= " LEFT JOIN " . MAIN_DB_PREFIX . "facture as f ON re.fk_facture_source = f.rowid";
        $sql .= " WHERE re.fk_soc = " . ((int) $id);
        $sql .= " AND re.entity IN (" . getEntity('invoice') . ")";
        $sql .= " AND re.discount_type = 0";
        $sql .= " AND re.fk_facture IS NULL AND re.fk_facture_line IS NULL";
        $sql .= " ORDER BY re.datec DESC, re.rowid DESC";

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ThirdPartyController::discounts query failed: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list discounts'], 500];
        }

        $discounts = array();
        while ($obj = $db->fetch_object($resql)) {
            $desc = (string) $obj->description;
            $isDeposit = (strpos($desc, '(DEPOSIT)') !== false) && (strpos($desc, '(EXCESS RECEIVED)') === false);
            $isExcess  = (strpos($desc, '(EXCESS RECEIVED)') !== false);
            $isCredit  = (strpos($desc, '(CREDIT_NOTE)') !== false);
            $hasSource = !empty($obj->fk_facture_source);

            if ($isCredit) {
                $type = 'credit_note';
            } elseif ($isExcess) {
                $type = 'excess';
            } elseif ($isDeposit) {
                $type = 'deposit';
            } else {
                $type = 'discount';
            }

            $applyMode = (!$hasSource || $isDeposit) ? 'line' : 'payment';

            $discounts[] = array(
                'id'               => (int) $obj->rowid,
                'type'             => $type,
                'applyMode'        => $applyMode,
                'description'      => $desc,
                'amountHt'         => (float) $obj->amount_ht,
                'amountTva'        => (float) $obj->amount_tva,
                'amountTtc'        => (float) $obj->amount_ttc,
                'tvaTx'            => (float) $obj->tva_tx,
                'sourceInvoiceId'  => $hasSource ? (int) $obj->fk_facture_source : 0,
                'sourceInvoiceRef' => $obj->ref_source !== null ? (string) $obj->ref_source : '',
            );
        }
        $db->free($resql);

        return [['discounts' => $discounts], 200];
    }

    /**
     * GET thirdparty/{id}/cockpit -- 360 synthesis of a thirdparty for the
     * desktop "cockpit" view (cf .claude/CLAUDE.md "Fiche tiers = cockpit").
     *
     * Single round-trip aggregation: counts (proposals/orders/invoices/
     * contacts/projects), turnover by year, recent + unpaid invoices, recent
     * contacts and recent agenda events. Each block is permission-gated
     * server-side ($user->hasRight on the natural Dolibarr right) AND resilient
     * (a SQL failure on one block is logged and degrades to an empty block --
     * never a 500 for the whole cockpit). The frontend mirrors the gating via
     * useMenu().has() so a forbidden block is simply not rendered.
     *
     * Entity scoping uses getEntity('<element>') everywhere (never a hardcoded
     * WHERE entity = N). Dates are returned as Unix epoch seconds (via jdate)
     * to match how the mappers expose datec/tms.
     *
     * @param array|null $arr
     * @return array
     */
    public function cockpit($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::cockpit forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::cockpit missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::cockpit thirdparty not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        // Cast to real booleans so the JSON permissions map is true/false
        // (hasRight() returns an int) -- the frontend and the contract expect
        // booleans, not 1/0.
        $canProposal = (bool) $user->hasRight('propal', 'lire');
        $canOrder    = (bool) $user->hasRight('commande', 'lire');
        $canInvoice  = (bool) $user->hasRight('facture', 'lire');
        $canContact  = (bool) $user->hasRight('societe', 'contact', 'lire');
        $canProject  = (bool) $user->hasRight('projet', 'lire');
        $canAgenda   = $user->hasRight('agenda', 'allactions', 'read')
            || $user->hasRight('agenda', 'myactions', 'read');

        $data = [
            'currency'    => !empty($conf->currency) ? $conf->currency : 'EUR',
            'permissions' => [
                'proposal' => $canProposal,
                'order'    => $canOrder,
                'invoice'  => $canInvoice,
                'contact'  => $canContact,
                'agenda'   => $canAgenda,
                'project'  => $canProject,
            ],
            'counts' => [
                'proposals' => 0,
                'orders'    => 0,
                'invoices'  => 0,
                'contacts'  => 0,
                'projects'  => 0,
            ],
            'ca'             => [],
            'caTotal'        => 0.0,
            'invoicesRecent' => [],
            'invoicesUnpaid' => [],
            'unpaidTotal'    => 0.0,
            'contactsRecent' => [],
            'events'         => [],
        ];

        // ---- Counts (cheap, one row each) ----
        if ($canProposal) {
            $data['counts']['proposals'] = $this->cockpitCountBySoc('propal', 'propal', $id);
        }
        if ($canOrder) {
            $data['counts']['orders'] = $this->cockpitCountBySoc('commande', 'commande', $id);
        }
        if ($canInvoice) {
            $data['counts']['invoices'] = $this->cockpitCountBySoc('facture', 'facture', $id);
        }
        if ($canContact) {
            $data['counts']['contacts'] = $this->cockpitCountBySoc('socpeople', 'contact', $id);
        }
        if ($canProject) {
            $data['counts']['projects'] = $this->cockpitCountBySoc('projet', 'project', $id);
        }

        // ---- Invoices: turnover by year + recent + unpaid ----
        if ($canInvoice) {
            // Turnover (CA) by year: validated (1) and paid (2) invoices only,
            // abandoned (3) and drafts (0) excluded. Year is extracted in PHP
            // (jdate) to stay portable across MySQL and the SQLite test driver
            // -- no MySQL-only YEAR() in the SQL.
            $sql = "SELECT datef, total_ttc FROM " . MAIN_DB_PREFIX . "facture";
            $sql .= " WHERE fk_soc = " . ((int) $id);
            $sql .= " AND entity IN (" . getEntity('facture') . ")";
            $sql .= " AND fk_statut IN (1, 2)";
            $resql = $db->query($sql);
            if ($resql) {
                $byYear = [];
                while ($obj = $db->fetch_object($resql)) {
                    $ts = $obj->datef ? (int) $db->jdate($obj->datef) : 0;
                    if ($ts <= 0) {
                        continue;
                    }
                    $year = (int) dol_print_date($ts, '%Y');
                    if (!isset($byYear[$year])) {
                        $byYear[$year] = ['ttc' => 0.0, 'count' => 0];
                    }
                    $byYear[$year]['ttc'] += (float) $obj->total_ttc;
                    $byYear[$year]['count']++;
                }
                $db->free($resql);

                ksort($byYear);
                $total = 0.0;
                foreach ($byYear as $year => $agg) {
                    $data['ca'][] = [
                        'year'  => (int) $year,
                        'ttc'   => round((float) $agg['ttc'], 2),
                        'count' => (int) $agg['count'],
                    ];
                    $total += (float) $agg['ttc'];
                }
                $data['caTotal'] = round($total, 2);
            } else {
                dol_syslog("DPK ThirdPartyController::cockpit CA SQL error: " . $db->lasterror(), LOG_ERR);
            }

            // Recent invoices (any status), newest first.
            $sql = "SELECT rowid, ref, datef, total_ht, total_ttc, fk_statut, paye";
            $sql .= " FROM " . MAIN_DB_PREFIX . "facture";
            $sql .= " WHERE fk_soc = " . ((int) $id);
            $sql .= " AND entity IN (" . getEntity('facture') . ")";
            $sql .= " ORDER BY datef DESC, rowid DESC";
            // Cap at 25: the desktop cockpit lets each user pick a per-box list
            // length up to 20 (+"Tout"), sliced client-side, so 25 gives the
            // frontend enough rows to honour any choice without a per-request
            // param.
            $sql .= $db->plimit(25, 0);
            $resql = $db->query($sql);
            if ($resql) {
                while ($obj = $db->fetch_object($resql)) {
                    $data['invoicesRecent'][] = [
                        'id'       => (int) $obj->rowid,
                        'ref'      => (string) $obj->ref,
                        'date'     => $obj->datef ? (int) $db->jdate($obj->datef) : 0,
                        'totalHt'  => (float) $obj->total_ht,
                        'totalTtc' => (float) $obj->total_ttc,
                        'statut'   => (int) $obj->fk_statut,
                        'paye'     => (int) $obj->paye,
                    ];
                }
                $db->free($resql);
            } else {
                dol_syslog("DPK ThirdPartyController::cockpit recent invoices SQL error: " . $db->lasterror(), LOG_ERR);
            }

            // Unpaid invoices: validated (1) and not paid (paye=0). Total is
            // summed over ALL unpaid; the returned list is capped to 25 (see
            // recent-invoices note -- lets the user pick up to 20 client-side).
            $sql = "SELECT rowid, ref, total_ttc, date_lim_reglement";
            $sql .= " FROM " . MAIN_DB_PREFIX . "facture";
            $sql .= " WHERE fk_soc = " . ((int) $id);
            $sql .= " AND entity IN (" . getEntity('facture') . ")";
            $sql .= " AND fk_statut = 1 AND paye = 0";
            $sql .= " ORDER BY date_lim_reglement ASC, rowid ASC";
            $resql = $db->query($sql);
            if ($resql) {
                $unpaidTotal = 0.0;
                while ($obj = $db->fetch_object($resql)) {
                    $unpaidTotal += (float) $obj->total_ttc;
                    if (count($data['invoicesUnpaid']) < 25) {
                        $data['invoicesUnpaid'][] = [
                            'id'       => (int) $obj->rowid,
                            'ref'      => (string) $obj->ref,
                            'totalTtc' => (float) $obj->total_ttc,
                            'dateLim'  => $obj->date_lim_reglement ? (int) $db->jdate($obj->date_lim_reglement) : 0,
                        ];
                    }
                }
                $db->free($resql);
                $data['unpaidTotal'] = round($unpaidTotal, 2);
            } else {
                dol_syslog("DPK ThirdPartyController::cockpit unpaid invoices SQL error: " . $db->lasterror(), LOG_ERR);
            }
        }

        // ---- Recent contacts ----
        if ($canContact) {
            $sql = "SELECT rowid, firstname, lastname, email, phone_pro, phone_mobile, statut";
            $sql .= " FROM " . MAIN_DB_PREFIX . "socpeople";
            $sql .= " WHERE fk_soc = " . ((int) $id);
            $sql .= " AND entity IN (" . getEntity('contact') . ")";
            $sql .= " ORDER BY lastname ASC, firstname ASC";
            $sql .= $db->plimit(25, 0);
            $resql = $db->query($sql);
            if ($resql) {
                while ($obj = $db->fetch_object($resql)) {
                    $data['contactsRecent'][] = [
                        'id'          => (int) $obj->rowid,
                        'firstname'   => (string) $obj->firstname,
                        'lastname'    => (string) $obj->lastname,
                        'email'       => (string) $obj->email,
                        'phonePro'    => (string) $obj->phone_pro,
                        'phoneMobile' => (string) $obj->phone_mobile,
                        'statut'      => (int) $obj->statut,
                    ];
                }
                $db->free($resql);
            } else {
                dol_syslog("DPK ThirdPartyController::cockpit contacts SQL error: " . $db->lasterror(), LOG_ERR);
            }
        }

        // ---- Recent agenda events ----
        if ($canAgenda) {
            $sql = "SELECT id, label, datep, code";
            $sql .= " FROM " . MAIN_DB_PREFIX . "actioncomm";
            $sql .= " WHERE fk_soc = " . ((int) $id);
            $sql .= " AND entity IN (" . getEntity('agenda') . ")";
            $sql .= " ORDER BY datep DESC, id DESC";
            $sql .= $db->plimit(25, 0);
            $resql = $db->query($sql);
            if ($resql) {
                while ($obj = $db->fetch_object($resql)) {
                    $data['events'][] = [
                        'id'    => (int) $obj->id,
                        'label' => (string) $obj->label,
                        'date'  => $obj->datep ? (int) $db->jdate($obj->datep) : 0,
                        'code'  => (string) $obj->code,
                    ];
                }
                $db->free($resql);
            } else {
                dol_syslog("DPK ThirdPartyController::cockpit events SQL error: " . $db->lasterror(), LOG_ERR);
            }
        }

        return [$data, 200];
    }

    /**
     * Count rows of a Dolibarr table linked to a thirdparty (fk_soc), scoped
     * to the current tenant entity. Returns 0 on SQL error (logged) so a single
     * failing block never breaks the whole cockpit.
     *
     * @param string $table      llx table name without the MAIN_DB_PREFIX (e.g. 'facture')
     * @param string $entityKey  getEntity() element key (e.g. 'facture')
     * @param int    $id         Thirdparty id
     * @param string $extraWhere Optional extra " AND ..." clause
     * @return int
     */
    private function cockpitCountBySoc($table, $entityKey, $id, $extraWhere = '')
    {
        global $db;

        $sql = "SELECT COUNT(*) as nb FROM " . MAIN_DB_PREFIX . $table;
        $sql .= " WHERE fk_soc = " . ((int) $id);
        $sql .= " AND entity IN (" . getEntity($entityKey) . ")";
        $sql .= $extraWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ThirdPartyController::cockpit count error on " . $table . ": " . $db->lasterror(), LOG_ERR);
            return 0;
        }
        $row = $db->fetch_object($resql);
        $nb = $row ? (int) $row->nb : 0;
        $db->free($resql);
        return $nb;
    }

    /**
     * POST thirdparty/{id}/email -- send a free email to the thirdparty
     * (mirrors Dolibarr's "Envoyer email" on the company card). Unlike the
     * document send (SendEmailTrait), there is NO PDF attachment: this is a
     * plain message to the thirdparty (or an explicit recipient).
     *
     * On success the email is logged as an agenda event linked to the
     * thirdparty (best-effort: a logging failure never fails the already-sent
     * email), so it surfaces in the cockpit "Derniers événements" card.
     *
     * The mailer is resolved through SendEmailMailerRegistry::$cmailFileClass
     * so integration tests can inject a mock and avoid opening a real SMTP
     * socket.
     *
     * Body fields: to (optional, defaults to the thirdparty email), subject
     * (required), body, cc, bcc (CSV), ishtml.
     *
     * @param array|null $arr
     * @return array
     */
    public function sendEmail($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('societe', 'lire')) {
            dol_syslog("DPK ThirdPartyController::sendEmail forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ThirdPartyController::sendEmail missing id", LOG_WARNING);
            return [['error' => 'Thirdparty id is required'], 400];
        }

        $tp = new Societe($db);
        if ($tp->fetch($id) <= 0) {
            dol_syslog("DPK ThirdPartyController::sendEmail not found id=" . $id, LOG_WARNING);
            return [['error' => 'Thirdparty not found'], 404];
        }

        // Recipient: explicit 'to' wins, otherwise the thirdparty email.
        $to = isset($arr['to']) ? trim((string) $arr['to']) : '';
        if ($to === '') {
            $to = trim((string) ($tp->email ?? ''));
        }
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            dol_syslog("DPK ThirdPartyController::sendEmail invalid recipient '" . $to . "'", LOG_WARNING);
            return [['error' => "A valid 'to' email address is required"], 400];
        }

        // cc / bcc accept "a@b,c@d" CSV -- validate each, refuse the whole
        // request on a bad address (same contract as SendEmailTrait).
        $cc = isset($arr['cc']) ? trim((string) $arr['cc']) : '';
        $bcc = isset($arr['bcc']) ? trim((string) $arr['bcc']) : '';
        foreach (['cc' => $cc, 'bcc' => $bcc] as $kind => $list) {
            if ($list === '') {
                continue;
            }
            foreach (explode(',', $list) as $piece) {
                $piece = trim($piece);
                if ($piece !== '' && !filter_var($piece, FILTER_VALIDATE_EMAIL)) {
                    dol_syslog("DPK ThirdPartyController::sendEmail invalid {$kind} '" . $piece . "'", LOG_WARNING);
                    return [['error' => "Invalid email in {$kind}: " . $piece], 400];
                }
            }
        }

        $subject = isset($arr['subject']) ? trim((string) $arr['subject']) : '';
        if ($subject === '') {
            dol_syslog("DPK ThirdPartyController::sendEmail missing subject", LOG_WARNING);
            return [['error' => "A 'subject' is required"], 400];
        }
        $body = isset($arr['body']) ? (string) $arr['body'] : '';
        if (trim($body) === '') {
            // CMailFile refuses an empty body with ErrorBodyIsRequired.
            $body = $subject;
        }
        $msgIsHtml = isset($arr['ishtml']) ? (int) $arr['ishtml'] : 0;

        // From resolution (same priority as SendEmailTrait).
        $from = (string) (getDolGlobalString('MAIN_MAIL_EMAIL_FROM') ?: '');
        if ($from === '' && !empty($user->email)) {
            $from = (string) $user->email;
        }
        if ($from === '') {
            $host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : 'localhost';
            $from = 'no-reply@' . $host;
        }

        $trackid = 'thirdparty-' . $id;

        $mailerClass = SendEmailMailerRegistry::$cmailFileClass;
        if (!class_exists($mailerClass)) {
            require_once DOL_DOCUMENT_ROOT . '/core/class/CMailFile.class.php';
        }

        // No attachment: empty filename lists (free email, not a document send).
        $mailer = new $mailerClass(
            $subject,
            $to,
            $from,
            $body,
            array(),
            array(),
            array(),
            $cc,
            $bcc,
            0,
            $msgIsHtml,
            '',
            '',
            $trackid,
            '',
            'standard'
        );

        $sent = $mailer->sendfile();
        if ($sent !== true && $sent !== 1) {
            $err = isset($mailer->error) ? (string) $mailer->error : 'sendfile returned ' . var_export($sent, true);
            dol_syslog("DPK ThirdPartyController::sendEmail sendfile() failed: " . $err, LOG_ERR);
            return [['error' => 'Failed to send email: ' . $err], 500];
        }

        $eventId = $this->logSentEmailEvent($id, $subject, $body);

        dol_syslog("DPK ThirdPartyController::sendEmail ok id=" . $id . " to=" . $to, LOG_INFO);

        return [[
            'ok'      => true,
            'to'      => $to,
            'cc'      => $cc,
            'bcc'     => $bcc,
            'subject' => $subject,
            'eventId' => $eventId,
            'trackid' => $trackid,
        ], 200];
    }

    /**
     * Best-effort: record a sent email as an agenda event linked to the
     * thirdparty (Dolibarr "AC_EMAIL"). Returns the event id, or 0 when the
     * user lacks the agenda create right or the creation fails -- never throws,
     * so a logging problem cannot fail an already-sent email.
     *
     * @param int    $socId
     * @param string $subject
     * @param string $body
     * @return int
     */
    private function logSentEmailEvent($socId, $subject, $body)
    {
        global $db, $user;

        if (!$user->hasRight('agenda', 'allactions', 'create')
            && !$user->hasRight('agenda', 'myactions', 'create')) {
            return 0;
        }

        try {
            require_once DOL_DOCUMENT_ROOT . '/comm/action/class/actioncomm.class.php';
            $event = new \ActionComm($db);
            $event->type_code = 'AC_EMAIL';
            $event->label = 'Email envoyé : ' . $subject;
            $event->note_private = $body;
            $event->datep = dol_now();
            $event->datef = dol_now();
            $event->percentage = -1;
            $event->socid = (int) $socId;
            $event->userownerid = (int) $user->id;
            $res = $event->create($user);
            if ($res <= 0) {
                dol_syslog("DPK ThirdPartyController::sendEmail agenda log failed: " . $event->error, LOG_WARNING);
                return 0;
            }
            return (int) $res;
        } catch (\Throwable $e) {
            dol_syslog("DPK ThirdPartyController::sendEmail agenda log exception: " . $e->getMessage(), LOG_WARNING);
            return 0;
        }
    }

    /**
     * Apply scalar fields from API payload onto a Societe instance.
     *
     * @param   Societe  $tp   Target Societe
     * @param   array    $arr  Input payload
     * @return  void
     */
    private function applyPayload(Societe $tp, array $arr)
    {
        if (isset($arr['name'])) {
            $tp->name = (string) $arr['name'];
        }
        if (isset($arr['name_alias'])) {
            $tp->name_alias = (string) $arr['name_alias'];
        }
        if (isset($arr['code_client'])) {
            $tp->code_client = (string) $arr['code_client'];
        }
        if (isset($arr['code_fournisseur'])) {
            $tp->code_fournisseur = (string) $arr['code_fournisseur'];
        }
        if (isset($arr['client'])) {
            $tp->client = (int) $arr['client'];
        }
        if (isset($arr['fournisseur'])) {
            $tp->fournisseur = (int) $arr['fournisseur'];
        }
        if (isset($arr['address'])) {
            $tp->address = (string) $arr['address'];
        }
        if (isset($arr['zip'])) {
            $tp->zip = (string) $arr['zip'];
        }
        if (isset($arr['town'])) {
            $tp->town = (string) $arr['town'];
        }
        if (isset($arr['country_code'])) {
            $tp->country_code = (string) $arr['country_code'];
        }
        if (isset($arr['phone'])) {
            $tp->phone = (string) $arr['phone'];
        }
        if (isset($arr['email'])) {
            $tp->email = (string) $arr['email'];
        }
        if (isset($arr['url'])) {
            $tp->url = (string) $arr['url'];
        }
        if (isset($arr['siren'])) {
            $tp->idprof1 = (string) $arr['siren'];
            $tp->siren = (string) $arr['siren'];
        }
        if (isset($arr['siret'])) {
            $tp->idprof2 = (string) $arr['siret'];
            $tp->siret = (string) $arr['siret'];
        }
        if (isset($arr['ape'])) {
            $tp->idprof3 = (string) $arr['ape'];
            $tp->ape = (string) $arr['ape'];
        }
        if (isset($arr['idprof4'])) {
            $tp->idprof4 = (string) $arr['idprof4'];
        }
        if (isset($arr['tva_intra'])) {
            $tp->tva_intra = (string) $arr['tva_intra'];
        }
        if (isset($arr['note_public'])) {
            $tp->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $tp->note_private = (string) $arr['note_private'];
        }
        if (isset($arr['status'])) {
            $tp->status = (int) $arr['status'];
        }
    }

    /**
     * Copy any 'options_*' keys from the payload into $tp->array_options.
     *
     * @param   Societe  $tp   Target Societe
     * @param   array    $arr  Input payload
     * @return  bool           True if at least one extrafield was set
     */
    private function applyExtrafields(Societe $tp, array $arr)
    {
        $touched = false;
        foreach ($arr as $key => $value) {
            if (strpos((string) $key, 'options_') === 0) {
                if (!is_array($tp->array_options)) {
                    $tp->array_options = [];
                }
                $tp->array_options[$key] = $value;
                $touched = true;
            }
        }
        return $touched;
    }
}
