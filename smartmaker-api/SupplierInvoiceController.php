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

dol_include_once('/fourn/class/fournisseur.facture.class.php');
dol_include_once('/fourn/class/fournisseur.commande.class.php');
dol_include_once('/fourn/class/paiementfourn.class.php');
dol_include_once('/societe/class/societe.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/SendEmailTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaymentTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PdfDownloadTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmSupplierInvoice.php');

use FactureFournisseur;
use CommandeFournisseur;
use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\SendEmailTrait;
use Dolipocket\Api\Trait\PaymentTrait;
use Dolipocket\Api\Trait\PdfDownloadTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

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
    use SendEmailTrait;
    use PaymentTrait;
    use PdfDownloadTrait;

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
     * GET supplierinvoice/lines/columns
     *
     * Returns the catalog describing the supplier-invoice-line columns. Cf
     * docs/DATATABLE_SPEC.md section 13.
     *
     * @param  array|null $arr
     * @return array            [data, httpCode]
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::linesColumns access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET supplierinvoice/describe
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

        if (!$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog('DPK SupplierInvoiceController::describe access denied for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
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

        $payload = $arr;
        unset($payload['id']);

        // parseDate (renvoie 0 pour invalide) preserve le comportement actuel
        // ou une date invalide pose $obj->date = 0 (epoch). Different de
        // normalizeTimestamp utilise par Invoice/Order/Proposal.
        foreach (['datef', 'date_lim_reglement'] as $dateField) {
            if (isset($payload[$dateField])) {
                $payload[$dateField] = $this->parseDate($payload[$dateField]);
            }
        }

        try {
            $sanitized = $this->mapper->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK SupplierInvoiceController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk: API socid sets both $obj->socid AND $obj->fk_soc (same
            // for the symmetric fk_soc key if the client sent it).
            if ($field === 'socid' || $field === 'fk_soc') {
                $obj->socid = $value;
                $obj->fk_soc = $value;
                continue;
            }
            // Quirk: API libelle writes to $obj->label (the SQL UPDATE
            // uses "libelle = $this->label", cf fournisseur.facture.class.php:1269).
            // The legacy $obj->libelle mirror is kept for any code path that
            // still reads it.
            if ($field === 'libelle') {
                $obj->label = $value;
                $obj->libelle = $value;
                continue;
            }
            // Quirk: API datef writes to BOTH $obj->date and $obj->datef.
            // FactureFournisseur::update() reads $this->date for SQL `datef`
            // (cf line 1265).
            if ($field === 'datef') {
                $obj->date = $value;
                $obj->datef = $value;
                continue;
            }
            // Quirk: API date_lim_reglement maps to $obj->date_echeance
            // (PHP property renamed; SQL column matches the API key).
            if ($field === 'date_lim_reglement') {
                $obj->date_echeance = $value;
                continue;
            }
            // Quirk: fk_cond_reglement / fk_mode_reglement -> cond_reglement_id / mode_reglement_id.
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
                    (string) ($oline->ref ?? ''),
                    // Carry over special_code so section lines (title /
                    // sub-total -- Lot 11) survive the order -> invoice
                    // conversion.
                    (int) ($oline->special_code ?? 0)
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

        $desc = isset($arr['description']) ? (string) $arr['description'] : (isset($arr['label']) ? (string) $arr['label'] : '');
        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : 0.0;
        $txtva = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : 0.0;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : 0.0;
        $fkProduct = isset($arr['fk_product']) ? (int) $arr['fk_product'] : 0;
        $remise = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : 0.0;
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : 0;
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : -1;
        $refSupplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : '';
        // Section lines (Lot 11). product_type=9 + special_code=0 -> title,
        // product_type=9 + special_code=104 -> sub-total. Pure label.
        // Note: FactureFournisseur::addline accepts special_code as string
        // (default empty string).
        $specialCode = isset($arr['special_code']) ? (int) $arr['special_code'] : 0;
        // Service-line dates (typed as Dolibarr dates -- normalised from
        // milliseconds / ISO strings via PaginatedListTrait::normalizeTimestamp).
        $dateStart = self::normalizeTimestamp($arr['date_start'] ?? null);
        $dateEnd = self::normalizeTimestamp($arr['date_end'] ?? null);
        if ($dateStart === null) {
            $dateStart = '';
        }
        if ($dateEnd === null) {
            $dateEnd = '';
        }
        $fkUnit = isset($arr['fk_unit']) && (int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null;

        // If a product was picked but description / subprice / tva_tx /
        // product_type / fk_unit were not supplied, hydrate them from the
        // product record. Mirrors what Dolibarr's standard addline form does
        // when prod_entry_mode=predef (cf objectline_create.tpl.php).
        if ($fkProduct > 0) {
            require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
            $product = new \Product($db);
            if ($product->fetch($fkProduct) > 0) {
                if ($desc === '') {
                    $desc = (string) ($product->description !== '' ? $product->description : $product->label);
                }
                if (!isset($arr['subprice'])) {
                    $pu = (float) $product->price;
                }
                if (!isset($arr['tva_tx']) && $product->tva_tx !== null) {
                    $txtva = (float) $product->tva_tx;
                }
                if (!isset($arr['product_type'])) {
                    $type = (int) $product->type;
                }
                if ($fkUnit === null && !empty($product->fk_unit)) {
                    $fkUnit = (int) $product->fk_unit;
                }
            }
        }

        // FactureFournisseur::addline signature (24 args):
        //   1 desc, 2 pu, 3 txtva, 4 txlocaltax1, 5 txlocaltax2,
        //   6 qty, 7 fk_product, 8 remise_percent, 9 date_start,
        //  10 date_end, 11 ventil, 12 info_bits, 13 price_base_type,
        //  14 type, 15 rang, 16 notrigger, 17 array_options, 18 fk_unit,
        //  19 origin_id, 20 pu_devise, 21 ref_supplier, 22 special_code,
        //  23 fk_parent_line, 24 fk_remise_except
        $res = $obj->addline(
            $desc,
            $pu,
            $txtva,
            0,
            0,
            $qty,
            $fkProduct,
            $remise,
            $dateStart,
            $dateEnd,
            0,
            '',
            'HT',
            $type,
            $rang,
            false,
            0,
            $fkUnit,
            0,
            0,
            $refSupplier,
            $specialCode
        );
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
        $obj->fetch_lines();

        // Find the existing line to merge unchanged values.
        $existing = null;
        foreach ($obj->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog('DPK SupplierInvoiceController::updateLine line not found lineid='.$lineid, LOG_WARNING);
            return [['error' => 'Line not found'], 404];
        }

        $desc = isset($arr['description']) ? (string) $arr['description'] : (string) ($existing->description ?? $existing->desc ?? '');
        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : (float) ($existing->subprice ?? $existing->pu_ht ?? 0.0);
        $vat = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : (float) ($existing->tva_tx ?? 0.0);
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : (float) ($existing->qty ?? 0.0);
        $idprod = isset($arr['fk_product']) ? (int) $arr['fk_product'] : (int) ($existing->fk_product ?? 0);
        $remise = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : (float) ($existing->remise_percent ?? 0.0);
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : (int) ($existing->product_type ?? 0);
        $refSupplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : (string) ($existing->ref_supplier ?? '');
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : (int) ($existing->rang ?? 0);
        // Service-line dates + unit -- normalised when present, otherwise we
        // keep the existing line's value (empty-string sentinel for dates,
        // null for fk_unit, both interpreted as "no change" by updateline).
        $dateStart = array_key_exists('date_start', $arr) ? self::normalizeTimestamp($arr['date_start']) : (int) ($existing->date_start ?? 0);
        $dateEnd = array_key_exists('date_end', $arr) ? self::normalizeTimestamp($arr['date_end']) : (int) ($existing->date_end ?? 0);
        if ($dateStart === null) {
            $dateStart = '';
        }
        if ($dateEnd === null) {
            $dateEnd = '';
        }
        $fkUnit = array_key_exists('fk_unit', $arr)
            ? ((int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null)
            : (isset($existing->fk_unit) && (int) $existing->fk_unit > 0 ? (int) $existing->fk_unit : null);

        // If a product was picked but description / subprice / tva_tx /
        // product_type / fk_unit were not supplied, hydrate them from the
        // product record. Mirrors the standard Dolibarr addline form
        // behaviour when prod_entry_mode=predef.
        if ($idprod > 0) {
            require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
            $product = new \Product($db);
            if ($product->fetch($idprod) > 0) {
                if (!isset($arr['description']) && $desc === '') {
                    $desc = (string) ($product->description !== '' ? $product->description : $product->label);
                }
                if (!isset($arr['subprice'])) {
                    $pu = (float) $product->price;
                }
                if (!isset($arr['tva_tx']) && $product->tva_tx !== null) {
                    $vat = (float) $product->tva_tx;
                }
                if (!isset($arr['product_type'])) {
                    $type = (int) $product->type;
                }
                if (!array_key_exists('fk_unit', $arr) && !empty($product->fk_unit)) {
                    $fkUnit = (int) $product->fk_unit;
                }
            }
        }

        // FactureFournisseur::updateline signature (20 args):
        //   1 id, 2 desc, 3 pu, 4 vatrate, 5 txlocaltax1, 6 txlocaltax2,
        //   7 qty, 8 idproduct, 9 price_base_type, 10 info_bits, 11 type,
        //  12 remise_percent, 13 notrigger, 14 date_start, 15 date_end,
        //  16 array_options, 17 fk_unit, 18 pu_devise, 19 ref_supplier,
        //  20 rang
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
            $dateStart,
            $dateEnd,
            0,
            $fkUnit,
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
        // Section lines (Lot 11). product_type=9 + special_code=0 -> title,
        // product_type=9 + special_code=104 -> sub-total.
        $specialCode = isset($line['special_code']) ? (int) $line['special_code'] : 0;

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
            $refSupplier,
            $specialCode
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
        $ts = self::normalizeTimestamp($value);
        return $ts === null ? 0 : $ts;
    }

    /**
     * POST supplierinvoice/{id}/pdf
     *
     * Generate the PDF document for the supplier invoice using the configured
     * model (Dolibarr conf $conf->global->SUPPLIER_INVOICE_ADDON_PDF, falls back to
     * 'canelle'). Mirrors what the Dolibarr standard "(Re)generate" button
     * does on the supplier invoice card.
     *
     * Body params:
     *   - model    (optional) -- override the PDF model name
     *   - lang     (optional) -- output language
     *   - hideref  / hidedesc / hidedetails (optional bool)
     *
     * Returns { ok, file } where `file` is the basename of the generated
     * PDF (saved under documents/<entity>/fournisseur/facture/<ref>/).
     *
     * @param array|null $arr
     * @return array
     */
    public function generatePdf($arr = null)
    {
        global $db, $user, $langs, $conf;

        if (!$user->hasRight('fournisseur', 'facture', 'creer') && !$user->hasRight('fournisseur', 'facture', 'lire')) {
            dol_syslog("DPK SupplierInvoiceController::generatePdf forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierInvoiceController::generatePdf missing id", LOG_WARNING);
            return [['error' => 'Supplier invoice id is required'], 400];
        }

        $obj = new FactureFournisseur($db);
        if ($obj->fetch($id) <= 0) {
            dol_syslog("DPK SupplierInvoiceController::generatePdf not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier invoice not found'], 404];
        }
        $obj->fetch_lines();
        $obj->fetch_thirdparty();

        $model = isset($arr['model']) && trim((string) $arr['model']) !== ''
            ? (string) $arr['model']
            : (string) (getDolGlobalString('SUPPLIER_INVOICE_ADDON_PDF') ?: 'canelle');
        $hideref = isset($arr['hideref']) ? (int) $arr['hideref'] : 0;
        $hidedesc = isset($arr['hidedesc']) ? (int) $arr['hidedesc'] : 0;
        $hidedetails = isset($arr['hidedetails']) ? (int) $arr['hidedetails'] : 0;

        $result = $obj->generateDocument($model, $langs, $hidedetails, $hidedesc, $hideref);
        if ($result <= 0) {
            dol_syslog("DPK SupplierInvoiceController::generatePdf generateDocument() failed: " . $obj->error, LOG_ERR);
            return [['error' => 'Failed to generate PDF: ' . $obj->error], 500];
        }

        return [
            ['ok' => true, 'file' => $obj->last_main_doc ?? '', 'model' => $model],
            200,
        ];
    }

    /**
     * POST supplierinvoice/{id}/send
     *
     * Send the supplier invoice by email with the last generated PDF attached.
     * Cf .claude/CLAUDE.md "Envoi par email" (todo.md task 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function send($arr = null)
    {
        return $this->sendEmail($arr, [
            'objectClass'   => '\\FactureFournisseur',
            'permGroup'     => ['fournisseur', 'facture'],
            'logTag'        => 'SupplierInvoiceController',
            'notFoundLabel' => 'Supplier invoice',
            'defaultModel'  => 'canelle',
            'addonPdfKey'   => 'SUPPLIER_INVOICE_ADDON_PDF',
            'subjectPrefix' => 'Facture fournisseur',
        ]);
    }

    /**
     * GET supplierinvoice/{id}/pdf/download
     *
     * Stream the last generated PDF for the supplier invoice. Reads
     * $obj->last_main_doc; does NOT regenerate. Cf todo.md task 3.
     *
     * @param array|null $arr
     * @return array
     */
    public function download($arr = null)
    {
        return $this->downloadPdf($arr, [
            'objectClass'   => '\\FactureFournisseur',
            'permGroup'     => ['fournisseur', 'facture'],
            'logTag'        => 'SupplierInvoiceController',
            'notFoundLabel' => 'Supplier invoice',
        ]);
    }

    /**
     * POST supplierinvoice/{id}/payment
     *
     * Record a supplier payment against this invoice. Delegates to
     * PaymentTrait::addPayment which encapsulates PaiementFourn::create
     * + the "close on full" flag so the invoice's `paye` flips
     * automatically when the running total reaches total_ttc.
     *
     * Body (cf PaymentTrait::addPayment docblock):
     *   amount, payment_mode, payment_date, ref, fk_account, note
     *
     * @param array|null $arr
     * @return array
     */
    public function pay($arr = null)
    {
        return $this->addPayment($arr, [
            'invoiceClass'  => '\\FactureFournisseur',
            'paymentClass'  => 'supplier',
            'permGroup'     => ['fournisseur', 'facture'],
            'logTag'        => 'SupplierInvoiceController',
            'notFoundLabel' => 'Supplier invoice',
        ]);
    }
}
