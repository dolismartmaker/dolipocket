<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Api;

dol_include_once('/fourn/class/fournisseur.commande.class.php');
dol_include_once('/societe/class/societe.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/SendEmailTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PdfDownloadTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmSupplierOrder.php');

use CommandeFournisseur;
use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\SendEmailTrait;
use Dolipocket\Api\Trait\PdfDownloadTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * Controller for supplier orders (CommandeFournisseur).
 *
 * Implements the full purchase order lifecycle: list/show/create/update/delete,
 * status transitions (validate, approve, order, receive), and per-line CRUD.
 *
 * Adds DataTable v2 endpoints (cf docs/DATATABLE_SPEC.md): index() supports
 * the paginated envelope when list params are present, plus columns(), count()
 * and deleteBulk() siblings.
 */
class SupplierOrderController
{
    use PaginatedListTrait;
    use SendEmailTrait;
    use PdfDownloadTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'c.date_commande DESC, c.rowid DESC';

    /**
     * @var dmSupplierOrder Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmSupplierOrder();
    }

    /**
     * List supplier orders with optional filters.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (filters: socid, status, q).
     *   - Paginated envelope when at least one of search/filter/sort/page/limit
     *     is provided.
     *
     * @param  array|null $arr Query parameters
     * @return array            [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::index access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."commande_fournisseur as c";
        $baseWhere = " WHERE c.entity IN (".getEntity('supplier_order').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'c');
        $where = $baseWhere.$filterWhere;

        $countSql = "SELECT COUNT(c.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog('DPK SupplierOrderController::index count SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'c', self::$defaultSort);
        $sql = "SELECT c.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierOrderController::index page SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($row = $db->fetch_object($resql)) {
            $obj = new CommandeFournisseur($db);
            if ($obj->fetch((int) $row->rowid) <= 0) {
                dol_syslog('DPK SupplierOrderController::index fetch failed for rowid '.$row->rowid, LOG_WARNING);
                continue;
            }
            $obj->fetch_optionals();
            $items[] = $this->mapper->exportMappedDataFiltered($obj, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET supplierorder/columns
     *
     * @param  array|null $arr
     * @return array            [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::columns access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET supplierorder/lines/columns
     *
     * Returns the catalog describing the supplier-order-line columns. Cf
     * docs/DATATABLE_SPEC.md section 13.
     *
     * @param  array|null $arr
     * @return array            [data, httpCode]
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::linesColumns access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET supplierorder/describe
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

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::describe access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET supplierorder/count
     *
     * @param  array|null $arr  Query parameters (search, filter[...]).
     * @return array            [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::count access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'c');

        $sql = "SELECT COUNT(c.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."commande_fournisseur as c";
        $sql .= " WHERE c.entity IN (".getEntity('supplier_order').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierOrderController::count SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE supplierorder (bulk)
     *
     * @param  array|null $arr  Body payload.
     * @return array            [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'supprimer')) {
            dol_syslog('DPK SupplierOrderController::deleteBulk access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK SupplierOrderController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK SupplierOrderController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog('DPK SupplierOrderController::deleteBulk too many ids: '.count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $obj = new CommandeFournisseur($db);
            $res = $obj->fetch($id);
            if ($res <= 0) {
                dol_syslog('DPK SupplierOrderController::deleteBulk supplier order not found id='.$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Supplier order not found'];
                continue;
            }

            $resDel = $obj->delete($user);
            if ($resDel <= 0) {
                $reason = $obj->error !== '' ? $obj->error : 'Failed to delete';
                dol_syslog('DPK SupplierOrderController::deleteBulk failed id='.$id.': '.$reason, LOG_ERR);
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
     * Parse the optional ?include=... CSV into an appside whitelist.
     *
     * @param  array|null $arr
     * @return array<int,string>|null
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
     * Legacy index handler (filters: socid, status, q).
     *
     * @param  array|null $arr Query parameters
     * @return array            [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : 0;
        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : null;
        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';

        $sql  = 'SELECT c.rowid';
        $sql .= ' FROM '.MAIN_DB_PREFIX.'commande_fournisseur as c';
        $sql .= ' WHERE c.entity IN ('.getEntity('supplier_order').')';

        if ($socid > 0) {
            $sql .= ' AND c.fk_soc = '.$socid;
        }
        if ($status !== null) {
            $sql .= ' AND c.fk_statut = '.$status;
        }
        if ($q !== '') {
            $like = "'%".$db->escape($q)."%'";
            $sql .= " AND (c.ref LIKE ".$like." OR c.ref_supplier LIKE ".$like.")";
        }

        $sql .= ' ORDER BY c.date_commande DESC, c.rowid DESC';
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierOrderController::indexLegacy SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($row = $db->fetch_object($resql)) {
            $obj = new CommandeFournisseur($db);
            if ($obj->fetch($row->rowid) <= 0) {
                dol_syslog('DPK SupplierOrderController::indexLegacy fetch failed for rowid '.$row->rowid, LOG_WARNING);
                continue;
            }
            $obj->fetch_optionals();
            $items[] = $this->mapper->exportMappedData($obj);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Show one supplier order with its lines and thirdparty.
     *
     * @param  array|null $arr Route parameters (id)
     * @return array            [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog('DPK SupplierOrderController::show access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::show missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::show not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }
        $obj->fetch_optionals();
        $obj->fetch_lines();

        $data = $this->mapper->exportMappedData($obj);

        // Attach thirdparty summary for display
        if (!empty($obj->socid)) {
            $soc = new Societe($db);
            if ($soc->fetch($obj->socid) > 0) {
                $data->thirdparty_name = $soc->name;
            }
        }

        return [$data, 200];
    }

    /**
     * Create a new supplier order (status draft).
     *
     * @param  array|null $arr Body
     * @return array            [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::create access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $socid = !empty($arr['socid']) ? (int) $arr['socid'] : 0;
        if ($socid <= 0) {
            dol_syslog('DPK SupplierOrderController::create missing socid', LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $db->begin();

        $obj = new CommandeFournisseur($db);
        $obj->socid = $socid;
        $obj->fk_soc = $socid;
        $obj->ref_supplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : '';
        $obj->date_commande = !empty($arr['date_commande']) ? $this->parseDate($arr['date_commande']) : dol_now();
        $obj->date_livraison = !empty($arr['date_livraison']) ? $this->parseDate($arr['date_livraison']) : 0;
        $obj->note_public = isset($arr['note_public']) ? (string) $arr['note_public'] : '';
        $obj->note_private = isset($arr['note_private']) ? (string) $arr['note_private'] : '';
        if (!empty($arr['fk_cond_reglement'])) {
            $obj->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (!empty($arr['fk_mode_reglement'])) {
            $obj->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $newid = $obj->create($user);
        if ($newid <= 0) {
            dol_syslog('DPK SupplierOrderController::create failed: '.$obj->error, LOG_ERR);
            $db->rollback();
            return [['error' => 'Failed to create supplier order: '.$obj->error], 500];
        }

        // Optionally attach lines provided in body
        if (!empty($arr['lines']) && is_array($arr['lines'])) {
            foreach ($arr['lines'] as $line) {
                $res = $this->addLineToOrder($obj, $line);
                if ($res <= 0) {
                    dol_syslog('DPK SupplierOrderController::create addLine failed: '.$obj->error, LOG_ERR);
                    $db->rollback();
                    return [['error' => 'Failed to add line: '.$obj->error], 500];
                }
            }
        }

        $db->commit();

        $obj->fetch($newid);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 201];
    }

    /**
     * Update header fields of a supplier order.
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::update access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::update missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::update not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $payload = $arr;
        unset($payload['id']);

        // parseDate preserves the legacy "invalid -> epoch 0" coalescing
        // (different from normalizeTimestamp on Invoice/Order/Proposal).
        foreach (['date_commande', 'date_livraison'] as $dateField) {
            if (isset($payload[$dateField])) {
                $payload[$dateField] = $this->parseDate($payload[$dateField]);
            }
        }

        try {
            $sanitized = $this->mapper->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK SupplierOrderController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk: socid sets both $obj->socid AND $obj->fk_soc.
            if ($field === 'socid' || $field === 'fk_soc') {
                $obj->socid = $value;
                $obj->fk_soc = $value;
                continue;
            }
            // BUG FIX: legacy controller assigned $obj->date_livraison
            // which CommandeFournisseur::update() does NOT read; the SQL
            // UPDATE actually uses $obj->delivery_date (cf
            // fournisseur.commande.class.php:1695). The legacy mirror
            // $obj->date_livraison is kept for any code path still
            // reading the deprecated property.
            if ($field === 'date_livraison') {
                $obj->delivery_date = $value;
                $obj->date_livraison = $value;
                continue;
            }
            if ($field === 'fk_cond_reglement') {
                $obj->cond_reglement_id = $value;
                continue;
            }
            if ($field === 'fk_mode_reglement') {
                $obj->mode_reglement_id = $value;
                continue;
            }
            $obj->$field = $value;
        }

        $res = $obj->update($user);
        if ($res < 0) {
            dol_syslog('DPK SupplierOrderController::update failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to update supplier order: '.$obj->error], 500];
        }

        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Delete a supplier order.
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'supprimer')) {
            dol_syslog('DPK SupplierOrderController::delete access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::delete missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::delete not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $res = $obj->delete($user);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::delete failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to delete supplier order: '.$obj->error], 500];
        }

        return [['message' => 'Supplier order deleted'], 200];
    }

    /**
     * Validate a draft supplier order (statut 0 -> 1).
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::validate access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::validate missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::validate not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $res = $obj->valid($user);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::validate failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to validate supplier order: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Approve a validated supplier order (statut 1 -> 2).
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function approve($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::approve access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::approve missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::approve not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $res = $obj->approve($user);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::approve failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to approve supplier order: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Mark a supplier order as ordered/sent (statut 2 -> 3).
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function order($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::order access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::order missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::order not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $date = !empty($arr['date']) ? $this->parseDate($arr['date']) : dol_now();
        $methode = isset($arr['methode']) ? (int) $arr['methode'] : 0;
        $comment = isset($arr['comment']) ? (string) $arr['comment'] : '';

        $res = $obj->commande($user, $date, $methode, $comment);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::order failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to mark supplier order as ordered: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Register reception of a supplier order (status -> 4 partial or 5 complete).
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function receive($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::receive access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::receive missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::receive not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $date = !empty($arr['date']) ? $this->parseDate($arr['date']) : dol_now();
        $type = !empty($arr['type']) ? (string) $arr['type'] : 'tot';
        if (!in_array($type, ['tot', 'par', 'nev', 'can'], true)) {
            dol_syslog('DPK SupplierOrderController::receive invalid type '.$type, LOG_WARNING);
            return [['error' => 'Invalid reception type (expected tot, par, nev or can)'], 400];
        }
        $comment = isset($arr['comment']) ? (string) $arr['comment'] : '';

        $res = $obj->Livraison($user, $date, $type, $comment);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::receive failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to register reception: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Add a line to a supplier order.
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::addLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierOrderController::addLine missing id', LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::addLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $res = $this->addLineToOrder($obj, $arr);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::addLine failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to add line: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 201];
    }

    /**
     * Update an existing line.
     *
     * @param  array|null $arr Route id + lineid + body
     * @return array            [data, httpCode]
     */
    public function updateLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::updateLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id']) || empty($arr['lineid'])) {
            dol_syslog('DPK SupplierOrderController::updateLine missing id or lineid', LOG_WARNING);
            return [['error' => 'Supplier order id and line id are required'], 400];
        }

        $id = (int) $arr['id'];
        $lineid = (int) $arr['lineid'];

        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::updateLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }
        $obj->fetch_lines();

        // Find the existing line to merge unchanged values
        $existing = null;
        foreach ($obj->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog('DPK SupplierOrderController::updateLine line not found lineid='.$lineid, LOG_WARNING);
            return [['error' => 'Line not found'], 404];
        }

        $desc = isset($arr['description']) ? (string) $arr['description'] : (string) $existing->desc;
        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : (float) $existing->subprice;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : (float) $existing->qty;
        $remise = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : (float) $existing->remise_percent;
        $tva = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : (float) $existing->tva_tx;
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : (int) $existing->product_type;
        $refSupplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : (string) ($existing->ref_supplier ?? '');
        // Service-line dates + unit -- normalised when present, otherwise we
        // keep the existing line's value (empty string sentinel for dates,
        // null for fk_unit which CommandeFournisseur::updateline interprets
        // as "no change").
        $dateStart = array_key_exists('date_start', $arr) ? self::normalizeTimestamp($arr['date_start']) : (int) ($existing->date_start ?? 0);
        $dateEnd = array_key_exists('date_end', $arr) ? self::normalizeTimestamp($arr['date_end']) : (int) ($existing->date_end ?? 0);
        if ($dateStart === null) $dateStart = '';
        if ($dateEnd === null) $dateEnd = '';
        $fk_unit = array_key_exists('fk_unit', $arr)
            ? ((int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null)
            : (isset($existing->fk_unit) ? (int) $existing->fk_unit : null);

        // CommandeFournisseur::updateline signature (18 args):
        //   1 rowid, 2 desc, 3 pu, 4 qty, 5 remise_percent, 6 txtva,
        //   7 txlocaltax1, 8 txlocaltax2, 9 price_base_type, 10 info_bits,
        //  11 type, 12 notrigger, 13 date_start, 14 date_end,
        //  15 array_options, 16 fk_unit, 17 pu_ht_devise, 18 ref_supplier
        $res = $obj->updateline(
            $lineid,
            $desc,
            $pu,
            $qty,
            $remise,
            $tva,
            0,
            0,
            'HT',
            0,
            $type,
            0,
            $dateStart,
            $dateEnd,
            0,
            $fk_unit,
            0,
            $refSupplier
        );
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::updateLine failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to update line: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Delete a line.
     *
     * @param  array|null $arr Route id + lineid
     * @return array            [data, httpCode]
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'commande', 'creer')) {
            dol_syslog('DPK SupplierOrderController::deleteLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id']) || empty($arr['lineid'])) {
            dol_syslog('DPK SupplierOrderController::deleteLine missing id or lineid', LOG_WARNING);
            return [['error' => 'Supplier order id and line id are required'], 400];
        }

        $id = (int) $arr['id'];
        $lineid = (int) $arr['lineid'];

        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierOrderController::deleteLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $res = $obj->deleteline($lineid);
        if ($res <= 0) {
            dol_syslog('DPK SupplierOrderController::deleteLine failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to delete line: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Add one line to a CommandeFournisseur from raw payload data.
     *
     * @param  CommandeFournisseur $obj   The order
     * @param  array               $line  Line payload
     * @return int                          rowid of inserted line, <=0 on error
     */
    private function addLineToOrder(CommandeFournisseur $obj, array $line)
    {
        global $db;

        $desc = isset($line['description']) ? (string) $line['description'] : '';
        $pu = isset($line['subprice']) ? (float) $line['subprice'] : 0.0;
        $qty = isset($line['qty']) ? (float) $line['qty'] : 0.0;
        $tva = isset($line['tva_tx']) ? (float) $line['tva_tx'] : 0.0;
        $fkProduct = isset($line['fk_product']) ? (int) $line['fk_product'] : 0;
        $refSupplier = isset($line['ref_supplier']) ? (string) $line['ref_supplier'] : '';
        $remise = isset($line['remise_percent']) ? (float) $line['remise_percent'] : 0.0;
        $type = isset($line['product_type']) ? (int) $line['product_type'] : 0;
        $rang = isset($line['rang']) ? (int) $line['rang'] : -1;
        // Section lines (Lot 11). product_type=9 + special_code=0 -> title,
        // product_type=9 + special_code=104 -> sub-total. Pure label.
        $specialCode = isset($line['special_code']) ? (int) $line['special_code'] : 0;
        // Service-line dates (typed as Dolibarr dates -- normalised from
        // milliseconds / ISO strings via PaginatedListTrait::normalizeTimestamp).
        $dateStart = self::normalizeTimestamp($line['date_start'] ?? null);
        $dateEnd = self::normalizeTimestamp($line['date_end'] ?? null);
        if ($dateStart === null) $dateStart = null;
        if ($dateEnd === null) $dateEnd = null;
        $fk_unit = isset($line['fk_unit']) && (int) $line['fk_unit'] > 0 ? (int) $line['fk_unit'] : null;

        // If a product was picked but description / subprice / tva_tx /
        // product_type / fk_unit were not supplied, hydrate them from the
        // product record. Mirrors what Dolibarr's standard "addline" form
        // does after a product is chosen via the prod_entry_mode=predef
        // radio (cf objectline_create.tpl.php).
        if ($fkProduct > 0) {
            require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
            $product = new \Product($db);
            if ($product->fetch($fkProduct) > 0) {
                if ($desc === '') {
                    $desc = (string) ($product->description !== '' ? $product->description : $product->label);
                }
                if (!isset($line['subprice'])) {
                    $pu = (float) $product->price;
                }
                if (!isset($line['tva_tx']) && $product->tva_tx !== null) {
                    $tva = (float) $product->tva_tx;
                }
                if (!isset($line['product_type'])) {
                    $type = (int) $product->type;
                }
                if ($fk_unit === null && !empty($product->fk_unit)) {
                    $fk_unit = (int) $product->fk_unit;
                }
            }
        }

        // CommandeFournisseur::addline signature (24 args):
        //   1 desc, 2 pu_ht, 3 qty, 4 txtva, 5 txlocaltax1, 6 txlocaltax2,
        //   7 fk_product, 8 fk_prod_fourn_price, 9 ref_supplier,
        //  10 remise_percent, 11 price_base_type, 12 pu_ttc, 13 type,
        //  14 info_bits, 15 notrigger, 16 date_start, 17 date_end,
        //  18 array_options, 19 fk_unit, 20 pu_ht_devise,
        //  21 origin, 22 origin_id, 23 rang, 24 special_code
        return $obj->addline(
            $desc,
            $pu,
            $qty,
            $tva,
            0.0,
            0.0,
            $fkProduct,
            0,
            $refSupplier,
            $remise,
            'HT',
            0.0,
            $type,
            0,
            false,
            $dateStart,
            $dateEnd,
            0,
            $fk_unit,
            0,
            '',
            0,
            $rang,
            $specialCode
        );
    }

    /**
     * Parse a YYYY-MM-DD or numeric timestamp into a UNIX timestamp.
     *
     * @param  mixed $value Date input
     * @return int           Timestamp (0 if empty/invalid)
     */
    private function parseDate($value)
    {
        $ts = self::normalizeTimestamp($value);
        return $ts === null ? 0 : $ts;
    }

    /**
     * POST supplierorder/{id}/pdf
     *
     * Generate the PDF document for the supplier order using the configured
     * model (Dolibarr conf $conf->global->SUPPLIER_ORDER_ADDON_PDF, falls back to
     * 'muscadet'). Mirrors what the Dolibarr standard "(Re)generate" button
     * does on the supplier order card.
     *
     * Body params:
     *   - model    (optional) -- override the PDF model name
     *   - lang     (optional) -- output language
     *   - hideref  / hidedesc / hidedetails (optional bool)
     *
     * Returns { ok, file } where `file` is the basename of the generated
     * PDF (saved under documents/<entity>/fournisseur/commande/<ref>/).
     *
     * @param array|null $arr
     * @return array
     */
    public function generatePdf($arr = null)
    {
        global $db, $user, $langs, $conf;

        if (!$user->hasRight('fournisseur', 'commande', 'creer') && !$user->hasRight('fournisseur', 'commande', 'lire')) {
            dol_syslog("DPK SupplierOrderController::generatePdf forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierOrderController::generatePdf missing id", LOG_WARNING);
            return [['error' => 'Supplier order id is required'], 400];
        }

        $obj = new CommandeFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog("DPK SupplierOrderController::generatePdf not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }
        $obj->fetch_lines();
        $obj->fetch_thirdparty();

        $model = isset($arr['model']) && trim((string) $arr['model']) !== ''
            ? (string) $arr['model']
            : (string) (getDolGlobalString('SUPPLIER_ORDER_ADDON_PDF') ?: 'muscadet');
        $hideref = isset($arr['hideref']) ? (int) $arr['hideref'] : 0;
        $hidedesc = isset($arr['hidedesc']) ? (int) $arr['hidedesc'] : 0;
        $hidedetails = isset($arr['hidedetails']) ? (int) $arr['hidedetails'] : 0;

        $result = $obj->generateDocument($model, $langs, $hidedetails, $hidedesc, $hideref);
        if ($result <= 0) {
            dol_syslog("DPK SupplierOrderController::generatePdf generateDocument() failed: " . $obj->error, LOG_ERR);
            return [['error' => 'Failed to generate PDF: ' . $obj->error], 500];
        }

        return [
            ['ok' => true, 'file' => $obj->last_main_doc ?? '', 'model' => $model],
            200,
        ];
    }

    /**
     * POST supplierorder/{id}/send
     *
     * Send the supplier order by email with the last generated PDF attached.
     * Cf .claude/CLAUDE.md "Envoi par email" (todo.md task 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function send($arr = null)
    {
        return $this->sendEmail($arr, [
            'objectClass'   => '\\CommandeFournisseur',
            'permGroup'     => ['fournisseur', 'commande'],
            'logTag'        => 'SupplierOrderController',
            'notFoundLabel' => 'Supplier order',
            'defaultModel'  => 'muscadet',
            'addonPdfKey'   => 'SUPPLIER_ORDER_ADDON_PDF',
            'subjectPrefix' => 'Commande fournisseur',
        ]);
    }

    /**
     * GET supplierorder/{id}/pdf/download
     *
     * Stream the last generated PDF for the supplier order. Reads
     * $obj->last_main_doc; does NOT regenerate. Cf todo.md task 3.
     *
     * @param array|null $arr
     * @return array
     */
    public function download($arr = null)
    {
        return $this->downloadPdf($arr, [
            'objectClass'   => '\\CommandeFournisseur',
            'permGroup'     => ['fournisseur', 'commande'],
            'logTag'        => 'SupplierOrderController',
            'notFoundLabel' => 'Supplier order',
        ]);
    }
}
