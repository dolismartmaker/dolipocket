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

use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;

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
        $this->applyPayload($tp, $arr);

        $res = $tp->update($id, $user);
        if ($res < 0) {
            dol_syslog("DPK ThirdPartyController::update failed: ".$tp->error, LOG_ERR);
            return [['error' => 'Failed to update thirdparty: '.$tp->error], 500];
        }

        if ($this->applyExtrafields($tp, $arr)) {
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
