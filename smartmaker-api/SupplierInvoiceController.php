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

require_once DOL_DOCUMENT_ROOT.'/fourn/class/fournisseur.facture.class.php';
require_once DOL_DOCUMENT_ROOT.'/fourn/class/fournisseur.commande.class.php';
require_once DOL_DOCUMENT_ROOT.'/fourn/class/paiementfourn.class.php';
require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmSupplierInvoice.php');

use FactureFournisseur;
use CommandeFournisseur;
use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;

/**
 * Controller for supplier invoices (FactureFournisseur).
 *
 * Adds DataTable v2 endpoints (cf docs/DATATABLE_SPEC.md): index() supports the
 * paginated envelope when list params are present, plus columns(), count() and
 * deleteBulk() siblings.
 */
class SupplierInvoiceController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'f.datef DESC, f.rowid DESC';

    /**
     * @var dmSupplierInvoice Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmSupplierInvoice();
    }

    /**
     * List supplier invoices with optional filters.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (filters: socid, status, paye).
     *   - Paginated envelope when at least one of search/filter/sort/page/limit
     *     is provided.
     *
     * @param  array|null $arr Query parameters
     * @return array            [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::index access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."facture_fourn as f";
        $baseWhere = " WHERE f.entity IN (".getEntity('facture_fourn').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'f');
        $where = $baseWhere.$filterWhere;

        $countSql = "SELECT COUNT(f.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog('DPK SupplierInvoiceController::index count SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'f', self::$defaultSort);
        $sql = "SELECT f.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierInvoiceController::index page SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($row = $db->fetch_object($resql)) {
            $obj = new FactureFournisseur($db);
            if ($obj->fetch((int) $row->rowid) <= 0) {
                dol_syslog('DPK SupplierInvoiceController::index fetch failed for rowid '.$row->rowid, LOG_WARNING);
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
     * GET supplierinvoice/columns
     *
     * @param  array|null $arr
     * @return array            [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::columns access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET supplierinvoice/count
     *
     * @param  array|null $arr  Query parameters (search, filter[...]).
     * @return array            [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::count access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'f');

        $sql = "SELECT COUNT(f.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."facture_fourn as f";
        $sql .= " WHERE f.entity IN (".getEntity('facture_fourn').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierInvoiceController::count SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE supplierinvoice (bulk)
     *
     * @param  array|null $arr  Body payload.
     * @return array            [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'supprimer')) {
            dol_syslog('DPK SupplierInvoiceController::deleteBulk access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK SupplierInvoiceController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK SupplierInvoiceController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog('DPK SupplierInvoiceController::deleteBulk too many ids: '.count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $obj = new FactureFournisseur($db);
            $res = $obj->fetch($id);
            if ($res <= 0) {
                dol_syslog('DPK SupplierInvoiceController::deleteBulk supplier invoice not found id='.$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Supplier invoice not found'];
                continue;
            }

            $resDel = $obj->delete($user);
            if ($resDel <= 0) {
                $reason = $obj->error !== '' ? $obj->error : 'Failed to delete';
                dol_syslog('DPK SupplierInvoiceController::deleteBulk failed id='.$id.': '.$reason, LOG_ERR);
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
     * Legacy index handler (filters: socid, status, paye).
     *
     * @param  array|null $arr Query parameters
     * @return array            [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : 0;
        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : null;
        $paye = isset($arr['paye']) && $arr['paye'] !== '' ? (int) $arr['paye'] : null;

        $sql  = 'SELECT f.rowid';
        $sql .= ' FROM '.MAIN_DB_PREFIX.'facture_fourn as f';
        $sql .= ' WHERE f.entity IN ('.getEntity('facture_fourn').')';

        if ($socid > 0) {
            $sql .= ' AND f.fk_soc = '.$socid;
        }
        if ($status !== null) {
            $sql .= ' AND f.fk_statut = '.$status;
        }
        if ($paye !== null) {
            $sql .= ' AND f.paye = '.$paye;
        }

        $sql .= ' ORDER BY f.datef DESC, f.rowid DESC';
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierInvoiceController::indexLegacy SQL error: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($row = $db->fetch_object($resql)) {
            $obj = new FactureFournisseur($db);
            if ($obj->fetch($row->rowid) <= 0) {
                dol_syslog('DPK SupplierInvoiceController::indexLegacy fetch failed for rowid '.$row->rowid, LOG_WARNING);
                continue;
            }
            $obj->fetch_optionals();
            $items[] = $this->mapper->exportMappedData($obj);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Show a supplier invoice with its lines, thirdparty and payments.
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::show access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierInvoiceController::show missing id', LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::show not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
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

        // Attach payments recap (read-only for the PWA fiche)
        $data->payments = $this->fetchPayments($id);
        $data->total_paid = 0.0;
        foreach ($data->payments as $p) {
            $data->total_paid += (float) $p['amount'];
        }
        $data->remain_to_pay = (float) $obj->total_ttc - $data->total_paid;

        return [$data, 200];
    }

    /**
     * Create a new supplier invoice (status draft).
     *
     * @param  array|null $arr Body
     * @return array            [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::create access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $socid = !empty($arr['socid']) ? (int) $arr['socid'] : 0;
        if ($socid <= 0) {
            dol_syslog('DPK SupplierInvoiceController::create missing socid', LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $db->begin();

        $obj = new FactureFournisseur($db);
        $obj->socid = $socid;
        $obj->fk_soc = $socid;
        $obj->ref_supplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : '';
        $obj->type = isset($arr['type']) ? (int) $arr['type'] : FactureFournisseur::TYPE_STANDARD;
        $obj->libelle = isset($arr['libelle']) ? (string) $arr['libelle'] : '';
        $obj->label = $obj->libelle;
        $obj->date = !empty($arr['datef']) ? $this->parseDate($arr['datef']) : dol_now();
        $obj->datef = $obj->date;
        if (!empty($arr['date_lim_reglement'])) {
            $obj->date_echeance = $this->parseDate($arr['date_lim_reglement']);
        }
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
            dol_syslog('DPK SupplierInvoiceController::create failed: '.$obj->error, LOG_ERR);
            $db->rollback();
            return [['error' => 'Failed to create supplier invoice: '.$obj->error], 500];
        }

        // Optionally attach lines provided in body
        if (!empty($arr['lines']) && is_array($arr['lines'])) {
            foreach ($arr['lines'] as $line) {
                $res = $this->addLineToInvoice($obj, $line);
                if ($res <= 0) {
                    dol_syslog('DPK SupplierInvoiceController::create addLine failed: '.$obj->error, LOG_ERR);
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
     * Update header fields of a supplier invoice.
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::update access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierInvoiceController::update missing id', LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::update not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        if (isset($arr['socid'])) {
            $obj->socid = (int) $arr['socid'];
            $obj->fk_soc = (int) $arr['socid'];
        }
        if (isset($arr['ref_supplier'])) {
            $obj->ref_supplier = (string) $arr['ref_supplier'];
        }
        if (isset($arr['type'])) {
            $obj->type = (int) $arr['type'];
        }
        if (isset($arr['libelle'])) {
            $obj->libelle = (string) $arr['libelle'];
            $obj->label = $obj->libelle;
        }
        if (isset($arr['datef'])) {
            $obj->date = $this->parseDate($arr['datef']);
            $obj->datef = $obj->date;
        }
        if (isset($arr['date_lim_reglement'])) {
            $obj->date_echeance = $this->parseDate($arr['date_lim_reglement']);
        }
        if (isset($arr['note_public'])) {
            $obj->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $obj->note_private = (string) $arr['note_private'];
        }
        if (isset($arr['fk_cond_reglement'])) {
            $obj->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (isset($arr['fk_mode_reglement'])) {
            $obj->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $res = $obj->update($user);
        if ($res < 0) {
            dol_syslog('DPK SupplierInvoiceController::update failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to update supplier invoice: '.$obj->error], 500];
        }

        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Delete a supplier invoice.
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'supprimer')) {
            dol_syslog('DPK SupplierInvoiceController::delete access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierInvoiceController::delete missing id', LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::delete not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        $res = $obj->delete($user);
        if ($res <= 0) {
            dol_syslog('DPK SupplierInvoiceController::delete failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to delete supplier invoice: '.$obj->error], 500];
        }

        return [['message' => 'Supplier invoice deleted'], 200];
    }

    /**
     * Validate a draft supplier invoice (statut 0 -> 1).
     *
     * @param  array|null $arr Route id
     * @return array            [data, httpCode]
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::validate access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierInvoiceController::validate missing id', LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::validate not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        $res = $obj->validate($user);
        if ($res <= 0) {
            dol_syslog('DPK SupplierInvoiceController::validate failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to validate supplier invoice: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Create a draft supplier invoice from an existing supplier order.
     *
     * @param  array|null $arr Route params (orderid)
     * @return array            [data, httpCode]
     */
    public function createFromOrder($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::createFromOrder access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['orderid'])) {
            dol_syslog('DPK SupplierInvoiceController::createFromOrder missing orderid', LOG_WARNING);
            return [['error' => 'Source supplier order id is required'], 400];
        }

        $orderId = (int) $arr['orderid'];
        $order = new CommandeFournisseur($db);
        if ($order->fetch($orderId) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::createFromOrder source order not found id='.$orderId, LOG_WARNING);
            return [['error' => 'Source supplier order not found'], 404];
        }
        $order->fetch_lines();

        $db->begin();

        $obj = new FactureFournisseur($db);
        $obj->socid = (int) $order->socid;
        $obj->fk_soc = (int) $order->socid;
        $obj->ref_supplier = (string) $order->ref_supplier;
        $obj->type = FactureFournisseur::TYPE_STANDARD;
        $obj->libelle = '';
        $obj->label = '';
        $obj->date = dol_now();
        $obj->datef = $obj->date;
        $obj->note_public = (string) $order->note_public;
        $obj->note_private = (string) $order->note_private;
        $obj->cond_reglement_id = (int) $order->cond_reglement_id;
        $obj->mode_reglement_id = (int) $order->mode_reglement_id;
        $obj->fk_project = (int) ($order->fk_project ?? 0);
        $obj->origin = 'order_supplier';
        $obj->origin_id = $orderId;
        $obj->linked_objects = ['order_supplier' => $orderId];

        $newid = $obj->create($user);
        if ($newid <= 0) {
            dol_syslog('DPK SupplierInvoiceController::createFromOrder create failed: '.$obj->error, LOG_ERR);
            $db->rollback();
            return [['error' => 'Failed to create supplier invoice from order: '.$obj->error], 500];
        }

        // Copy lines from source order to the new invoice
        if (!empty($order->lines)) {
            foreach ($order->lines as $oline) {
                $res = $obj->addline(
                    $oline->desc ?? $oline->description ?? '',
                    (float) ($oline->subprice ?? 0.0),
                    (float) ($oline->tva_tx ?? 0.0),
                    (float) ($oline->localtax1_tx ?? 0.0),
                    (float) ($oline->localtax2_tx ?? 0.0),
                    (float) ($oline->qty ?? 0.0),
                    (int) ($oline->fk_product ?? 0),
                    (float) ($oline->remise_percent ?? 0.0),
                    '',
                    '',
                    0,
                    0,
                    'HT',
                    (int) ($oline->product_type ?? 0),
                    (int) ($oline->rang ?? -1),
                    false,
                    0,
                    null,
                    $orderId,
                    0,
                    (string) ($oline->ref ?? '')
                );
                if ($res <= 0) {
                    dol_syslog('DPK SupplierInvoiceController::createFromOrder line copy failed: '.$obj->error, LOG_ERR);
                    $db->rollback();
                    return [['error' => 'Failed to copy line from source order: '.$obj->error], 500];
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
     * Add a line to a supplier invoice.
     *
     * @param  array|null $arr Route id + body
     * @return array            [data, httpCode]
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::addLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK SupplierInvoiceController::addLine missing id', LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $id = (int) $arr['id'];
        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::addLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        $res = $this->addLineToInvoice($obj, $arr);
        if ($res <= 0) {
            dol_syslog('DPK SupplierInvoiceController::addLine failed: '.$obj->error, LOG_ERR);
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

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::updateLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id']) || empty($arr['lineid'])) {
            dol_syslog('DPK SupplierInvoiceController::updateLine missing id or lineid', LOG_WARNING);
            return [['error' => 'Supplier invoice id and line id are required'], 400];
        }

        $id = (int) $arr['id'];
        $lineid = (int) $arr['lineid'];

        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::updateLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        $desc = isset($arr['description']) ? (string) $arr['description'] : '';
        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : 0.0;
        $vat = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : 0.0;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : 0.0;
        $idprod = isset($arr['fk_product']) ? (int) $arr['fk_product'] : 0;
        $remise = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : 0.0;
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : 0;
        $refSupplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : '';
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : 0;

        $res = $obj->updateline(
            $lineid,
            $desc,
            $pu,
            $vat,
            0,
            0,
            $qty,
            $idprod,
            'HT',
            0,
            $type,
            $remise,
            false,
            '',
            '',
            0,
            null,
            0,
            $refSupplier,
            $rang
        );
        if ($res <= 0) {
            dol_syslog('DPK SupplierInvoiceController::updateLine failed: '.$obj->error, LOG_ERR);
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

        if (!$user->hasRight('fournisseur', 'facture', 'creer')) {
            dol_syslog('DPK SupplierInvoiceController::deleteLine access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id']) || empty($arr['lineid'])) {
            dol_syslog('DPK SupplierInvoiceController::deleteLine missing id or lineid', LOG_WARNING);
            return [['error' => 'Supplier invoice id and line id are required'], 400];
        }

        $id = (int) $arr['id'];
        $lineid = (int) $arr['lineid'];

        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog('DPK SupplierInvoiceController::deleteLine not found id='.$id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }

        $res = $obj->deleteline($lineid);
        if ($res <= 0) {
            dol_syslog('DPK SupplierInvoiceController::deleteLine failed: '.$obj->error, LOG_ERR);
            return [['error' => 'Failed to delete line: '.$obj->error], 500];
        }

        $obj->fetch($id);
        $obj->fetch_optionals();
        $obj->fetch_lines();

        return [$this->mapper->exportMappedData($obj), 200];
    }

    /**
     * Add one line to a FactureFournisseur from raw payload data.
     *
     * @param  FactureFournisseur $obj  The invoice
     * @param  array              $line Line payload
     * @return int                       rowid of inserted line, <=0 on error
     */
    private function addLineToInvoice(FactureFournisseur $obj, array $line)
    {
        $desc = isset($line['description']) ? (string) $line['description'] : '';
        $pu = isset($line['subprice']) ? (float) $line['subprice'] : 0.0;
        $tva = isset($line['tva_tx']) ? (float) $line['tva_tx'] : 0.0;
        $qty = isset($line['qty']) ? (float) $line['qty'] : 0.0;
        $fkProduct = isset($line['fk_product']) ? (int) $line['fk_product'] : 0;
        $remise = isset($line['remise_percent']) ? (float) $line['remise_percent'] : 0.0;
        $type = isset($line['product_type']) ? (int) $line['product_type'] : 0;
        $rang = isset($line['rang']) ? (int) $line['rang'] : -1;
        $refSupplier = isset($line['ref_supplier']) ? (string) $line['ref_supplier'] : '';

        return $obj->addline(
            $desc,
            $pu,
            $tva,
            0,
            0,
            $qty,
            $fkProduct,
            $remise,
            '',
            '',
            0,
            '',
            'HT',
            $type,
            $rang,
            false,
            0,
            null,
            0,
            0,
            $refSupplier
        );
    }

    /**
     * Fetch payments linked to a supplier invoice (read-only summary).
     *
     * @param  int $invoiceId Invoice rowid
     * @return array          List of payments [{id, date, amount, mode}]
     */
    private function fetchPayments($invoiceId)
    {
        global $db;

        $payments = [];
        $sql  = 'SELECT pf.fk_paiementfourn as id, p.datep as datep, pf.amount as amount,';
        $sql .= ' c.code as mode_code, c.libelle as mode_label';
        $sql .= ' FROM '.MAIN_DB_PREFIX.'paiementfourn_facturefourn as pf';
        $sql .= ' INNER JOIN '.MAIN_DB_PREFIX.'paiementfourn as p ON p.rowid = pf.fk_paiementfourn';
        $sql .= ' LEFT JOIN '.MAIN_DB_PREFIX.'c_paiement as c ON c.id = p.fk_paiement';
        $sql .= ' WHERE pf.fk_facturefourn = '.(int) $invoiceId;
        $sql .= ' ORDER BY p.datep DESC, p.rowid DESC';

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK SupplierInvoiceController::fetchPayments SQL error: '.$db->lasterror(), LOG_ERR);
            return $payments;
        }
        while ($row = $db->fetch_object($resql)) {
            $payments[] = [
                'id' => (int) $row->id,
                'date' => $row->datep ? $db->jdate($row->datep) : null,
                'amount' => (float) $row->amount,
                'mode_code' => $row->mode_code,
                'mode_label' => $row->mode_label,
            ];
        }
        $db->free($resql);

        return $payments;
    }

    /**
     * Parse a YYYY-MM-DD or numeric timestamp into a UNIX timestamp.
     *
     * @param  mixed $value Date input
     * @return int           Timestamp (0 if empty/invalid)
     */
    private function parseDate($value)
    {
        if (empty($value)) {
            return 0;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        $ts = strtotime((string) $value);
        return $ts === false ? 0 : (int) $ts;
    }
}
