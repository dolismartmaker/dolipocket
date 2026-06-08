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

dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmWarehouse.php');

require_once DOL_DOCUMENT_ROOT.'/product/stock/class/entrepot.class.php';

use Entrepot;
use Dolipocket\Api\Trait\PaginatedListTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * REST API controller for Dolibarr warehouses (Entrepot class).
 *
 * Endpoints exposed:
 *   GET    warehouse           list (legacy or DataTable paginated)
 *   GET    warehouse/columns   DataTable column catalog
 *   GET    warehouse/count     DataTable total count for current filters
 *   GET    warehouse/{id}      fetch a single warehouse
 *   POST   warehouse           create
 *   PUT    warehouse/{id}      update
 *   DELETE warehouse           bulk delete by ids[]
 *   DELETE warehouse/{id}      delete one
 */
class WarehouseController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'e.ref ASC, e.rowid ASC';

    /**
     * @var dmWarehouse Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor: instantiate the mapper once per request.
     */
    public function __construct()
    {
        $this->mapper = new dmWarehouse();
    }

    /**
     * List warehouses for the current entity.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array with the historical 'status', 'q' query semantics.
     *   - Paginated envelope {items, total, page, limit} when at least one of
     *     search/filter[*]/sort/page/limit is provided.
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'lire')) {
            dol_syslog("DPK WarehouseController::index access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."entrepot as e";
        $baseWhere = " WHERE e.entity IN (".getEntity('stock').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'e');
        $where = $baseWhere.$filterWhere;

        $countSql = "SELECT COUNT(e.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK WarehouseController::index count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'e', self::$defaultSort);
        $sql = "SELECT e.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK WarehouseController::index page SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $warehouse = new Entrepot($db);
            if ($warehouse->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK WarehouseController::index could not fetch warehouse ".$obj->rowid, LOG_WARNING);
                continue;
            }
            $warehouse->fetch_optionals();
            $items[] = $this->mapper->exportMappedDataFiltered($warehouse, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET warehouse/columns
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

        if (!$user->hasRight('stock', 'lire')) {
            dol_syslog("DPK WarehouseController::columns access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET warehouse/describe
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

        if (!$user->hasRight('stock', 'lire')) {
            dol_syslog("DPK WarehouseController::describe access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET warehouse/count
     *
     * Returns {total: N} matching the current filters.
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'lire')) {
            dol_syslog("DPK WarehouseController::count access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'e');

        $sql = "SELECT COUNT(e.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."entrepot as e";
        $sql .= " WHERE e.entity IN (".getEntity('stock').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK WarehouseController::count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE warehouse (bulk)
     *
     * Body: { ids: [1, 2, ...] }, max 100. Each id is attempted independently.
     *
     * @param   array|null  $arr  Body payload.
     * @return  array              [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'supprimer')) {
            dol_syslog("DPK WarehouseController::deleteBulk access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK WarehouseController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK WarehouseController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK WarehouseController::deleteBulk too many ids: ".count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $warehouse = new Entrepot($db);
            $res = $warehouse->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK WarehouseController::deleteBulk warehouse not found id=".$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Warehouse not found'];
                continue;
            }

            $resDel = $warehouse->delete($user);
            if ($resDel <= 0) {
                $reason = $warehouse->error !== '' ? $warehouse->error : 'Failed to delete';
                dol_syslog("DPK WarehouseController::deleteBulk failed id=".$id.": ".$reason, LOG_ERR);
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
     * Parse the optional ?include=col1,col2,... CSV into an appside whitelist.
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
     * Legacy index handler kept for backward compatibility.
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : 1;
        $query = isset($arr['q']) ? trim((string) $arr['q']) : '';

        $sql = "SELECT e.rowid";
        $sql .= " FROM ".MAIN_DB_PREFIX."entrepot as e";
        $sql .= " WHERE e.entity IN (".getEntity('stock').")";
        if ($status !== -1) {
            $sql .= " AND e.statut = ".(int) $status;
        }
        if (!empty($query)) {
            $like = "%".$db->escape($query)."%";
            $sql .= " AND (e.ref LIKE '".$like."' OR e.lieu LIKE '".$like."' OR e.description LIKE '".$like."')";
        }
        $sql .= " ORDER BY e.ref ASC";

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK WarehouseController::indexLegacy SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $warehouse = new Entrepot($db);
            if ($warehouse->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK WarehouseController::indexLegacy could not fetch warehouse ".$obj->rowid, LOG_WARNING);
                continue;
            }
            $warehouse->fetch_optionals();
            $items[] = $this->formatWarehouse($warehouse);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single warehouse by id.
     *
     * @param   array|null  $arr  Route parameters (id).
     * @return  array              [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'lire')) {
            dol_syslog("DPK WarehouseController::show access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK WarehouseController::show missing id", LOG_WARNING);
            return [['error' => 'Warehouse id is required'], 400];
        }

        $id = (int) $arr['id'];
        $warehouse = new Entrepot($db);
        $result = $warehouse->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::show warehouse ".$id." not found", LOG_WARNING);
            return [['error' => 'Warehouse not found'], 404];
        }
        $warehouse->fetch_optionals();

        return [$this->formatWarehouse($warehouse), 200];
    }

    /**
     * Create a warehouse.
     *
     * @param   array|null  $arr  Request body.
     * @return  array              [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'creer')) {
            dol_syslog("DPK WarehouseController::create access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['label']) && empty($arr['ref'])) {
            dol_syslog("DPK WarehouseController::create missing label", LOG_WARNING);
            return [['error' => 'Field label is required'], 400];
        }

        $warehouse = new Entrepot($db);
        // Entrepot::create() reads $this->label and writes it into the ref column.
        $warehouse->label = !empty($arr['label']) ? (string) $arr['label'] : (string) $arr['ref'];
        $warehouse->description = isset($arr['description']) ? (string) $arr['description'] : '';
        $warehouse->lieu = isset($arr['lieu']) ? (string) $arr['lieu'] : '';
        $warehouse->address = isset($arr['address']) ? (string) $arr['address'] : '';
        $warehouse->zip = isset($arr['zip']) ? (string) $arr['zip'] : '';
        $warehouse->town = isset($arr['town']) ? (string) $arr['town'] : '';
        $warehouse->phone = isset($arr['phone']) ? (string) $arr['phone'] : '';
        $warehouse->fax = isset($arr['fax']) ? (string) $arr['fax'] : '';
        $warehouse->statut = isset($arr['statut']) ? (int) $arr['statut'] : 1;
        $warehouse->fk_parent = isset($arr['fk_parent']) ? (int) $arr['fk_parent'] : 0;

        $result = $warehouse->create($user);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::create failed: ".$warehouse->error, LOG_ERR);
            return [['error' => 'Failed to create warehouse: '.$warehouse->error], 500];
        }

        $warehouse->fetch($result);
        $warehouse->fetch_optionals();

        return [$this->formatWarehouse($warehouse), 201];
    }

    /**
     * Update a warehouse.
     *
     * @param   array|null  $arr  Route parameters and body.
     * @return  array              [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'creer')) {
            dol_syslog("DPK WarehouseController::update access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK WarehouseController::update missing id", LOG_WARNING);
            return [['error' => 'Warehouse id is required'], 400];
        }

        $id = (int) $arr['id'];
        $warehouse = new Entrepot($db);
        $result = $warehouse->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::update warehouse ".$id." not found", LOG_WARNING);
            return [['error' => 'Warehouse not found'], 404];
        }

        $payload = $arr;
        unset($payload['id']);

        try {
            $sanitized = $this->mapper->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK WarehouseController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            $warehouse->$field = $value;
        }

        $result = $warehouse->update($warehouse->id, $user);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::update failed: ".$warehouse->error, LOG_ERR);
            return [['error' => 'Failed to update warehouse: '.$warehouse->error], 500];
        }

        $warehouse->fetch($id);
        $warehouse->fetch_optionals();

        return [$this->formatWarehouse($warehouse), 200];
    }

    /**
     * Delete a warehouse.
     *
     * @param   array|null  $arr  Route parameters (id).
     * @return  array              [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'supprimer')) {
            dol_syslog("DPK WarehouseController::delete access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK WarehouseController::delete missing id", LOG_WARNING);
            return [['error' => 'Warehouse id is required'], 400];
        }

        $id = (int) $arr['id'];
        $warehouse = new Entrepot($db);
        $result = $warehouse->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::delete warehouse ".$id." not found", LOG_WARNING);
            return [['error' => 'Warehouse not found'], 404];
        }

        $result = $warehouse->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK WarehouseController::delete failed: ".$warehouse->error, LOG_ERR);
            return [['error' => 'Failed to delete warehouse: '.$warehouse->error], 500];
        }

        return [['message' => 'Warehouse deleted'], 200];
    }

    /**
     * Format a warehouse through the dmWarehouse mapper.
     *
     * @param   Entrepot  $warehouse  Loaded warehouse instance.
     * @return  array                  API representation.
     */
    private function formatWarehouse(Entrepot $warehouse)
    {
        // Ensure ref property is populated; the native fetch aliases ref into label.
        if (empty($warehouse->ref) && !empty($warehouse->label)) {
            $warehouse->ref = $warehouse->label;
        }

        $mapped = $this->mapper->exportMappedData($warehouse);
        $data = json_decode(json_encode($mapped), true);

        // Force stable presence of statut/fk_parent for callers (export skips empty).
        if (!isset($data['statut'])) {
            $data['statut'] = (int) ($warehouse->statut ?? 0);
        }
        if (!isset($data['fk_parent'])) {
            $data['fk_parent'] = (int) ($warehouse->fk_parent ?? 0);
        }

        return $data;
    }
}
