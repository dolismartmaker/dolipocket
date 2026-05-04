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

namespace Dolipocket\Api;

require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmInvoice.php');

use Facture;
use Commande;
use Dolipocket\Api\Trait\PaginatedListTrait;

/**
 * Customer invoice (facture client) API controller.
 *
 * Routes:
 *   GET    invoice                              -> index
 *   GET    invoice/columns                      -> columns
 *   GET    invoice/count                        -> count
 *   GET    invoice/{id}                         -> show
 *   POST   invoice                              -> create
 *   PUT    invoice/{id}                         -> update
 *   DELETE invoice                              -> deleteBulk
 *   DELETE invoice/{id}                         -> destroy
 *   POST   invoice/{id}/validate                -> validate
 *   POST   invoice/createfromorder/{orderid}    -> createFromOrder
 *   POST   invoice/{id}/line                    -> addLine
 *   PUT    invoice/{id}/line/{lineid}           -> updateLine
 *   DELETE invoice/{id}/line/{lineid}           -> deleteLine
 */
class InvoiceController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'f.datef DESC, f.rowid DESC';

    /**
     * @var dmInvoice Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmInvoice();
    }

    /**
     * List invoices.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (filters: socid, status, paye, q).
     *   - Paginated envelope when at least one of search/filter/sort/page/limit
     *     is provided.
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "facture as f";
        $baseWhere = " WHERE f.entity IN (" . getEntity('facture') . ")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'f');
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(f.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK InvoiceController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'f', self::$defaultSort);
        $sql = "SELECT f.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $invoice = new Facture($db);
            if ($invoice->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK InvoiceController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedDataFiltered($invoice, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET invoice/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET invoice/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'f');

        $sql = "SELECT COUNT(f.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "facture as f";
        $sql .= " WHERE f.entity IN (" . getEntity('facture') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE invoice (bulk)
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'supprimer')) {
            dol_syslog("DPK InvoiceController::deleteBulk forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK InvoiceController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK InvoiceController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK InvoiceController::deleteBulk too many ids: " . count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $invoice = new Facture($db);
            $res = $invoice->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK InvoiceController::deleteBulk invoice not found id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Invoice not found'];
                continue;
            }

            $resDel = $invoice->delete($user);
            if ($resDel <= 0) {
                $reason = $invoice->error !== '' ? $invoice->error : 'Failed to delete';
                dol_syslog("DPK InvoiceController::deleteBulk failed id=" . $id . ": " . $reason, LOG_ERR);
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
     * @param array|null $arr
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
     * Legacy index handler (filters: socid, status, paye, q).
     *
     * @param array|null $arr
     * @return array
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : 0;
        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : null;
        $paye = isset($arr['paye']) && $arr['paye'] !== '' ? (int) $arr['paye'] : null;
        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';

        $sql = "SELECT f.rowid FROM " . MAIN_DB_PREFIX . "facture as f";
        $sql .= " WHERE f.entity IN (" . getEntity('facture') . ")";
        if ($socid > 0) {
            $sql .= " AND f.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND f.fk_statut = " . $status;
        }
        if ($paye !== null) {
            $sql .= " AND f.paye = " . $paye;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND (f.ref LIKE '" . $like . "' OR f.ref_client LIKE '" . $like . "')";
        }
        $sql .= " ORDER BY f.datef DESC, f.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $invoice = new Facture($db);
            if ($invoice->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK InvoiceController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedData($invoice);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single invoice with its lines and a summary of payments.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::show missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        $invoice->fetch_lines();

        $data = $this->mapper->exportMappedData($invoice);

        // Append payment summary (list + total) for the recap section
        $payments = $invoice->getListOfPayments();
        $sum = 0.0;
        if (is_array($payments)) {
            foreach ($payments as $p) {
                $sum += (float) ($p['amount'] ?? 0);
            }
        }
        $data->payments = $payments;
        $data->total_paid = $sum;
        $data->remain_to_pay = (float) $invoice->total_ttc - $sum;

        return [$data, 200];
    }

    /**
     * Create a draft invoice for a thirdparty.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : (isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0);
        if ($socid <= 0) {
            dol_syslog("DPK InvoiceController::create missing socid", LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $invoice = new Facture($db);
        $invoice->socid = $socid;
        $invoice->type = isset($arr['type']) ? (int) $arr['type'] : Facture::TYPE_STANDARD;
        $invoice->date = !empty($arr['datef']) ? (is_numeric($arr['datef']) ? (int) $arr['datef'] : strtotime($arr['datef'])) : dol_now();
        $invoice->datef = $invoice->date;
        if (!empty($arr['date_lim_reglement'])) {
            $invoice->date_lim_reglement = is_numeric($arr['date_lim_reglement']) ? (int) $arr['date_lim_reglement'] : strtotime($arr['date_lim_reglement']);
        }
        if (isset($arr['ref_client'])) {
            $invoice->ref_client = $arr['ref_client'];
        }
        if (isset($arr['note_public'])) {
            $invoice->note_public = $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $invoice->note_private = $arr['note_private'];
        }
        if (!empty($arr['fk_cond_reglement'])) {
            $invoice->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (!empty($arr['fk_mode_reglement'])) {
            $invoice->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $invoice->create($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::create create() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to create invoice: ' . $invoice->error], 500];
        }

        $invoice->fetch($result);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 201];
    }

    /**
     * Update header fields of a draft invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::update missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        if (isset($arr['ref_client'])) {
            $invoice->ref_client = $arr['ref_client'];
        }
        if (isset($arr['datef'])) {
            $invoice->date = is_numeric($arr['datef']) ? (int) $arr['datef'] : strtotime($arr['datef']);
            $invoice->datef = $invoice->date;
        }
        if (isset($arr['date_lim_reglement'])) {
            $invoice->date_lim_reglement = is_numeric($arr['date_lim_reglement']) ? (int) $arr['date_lim_reglement'] : strtotime($arr['date_lim_reglement']);
        }
        if (isset($arr['note_public'])) {
            $invoice->note_public = $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $invoice->note_private = $arr['note_private'];
        }
        if (isset($arr['fk_cond_reglement'])) {
            $invoice->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (isset($arr['fk_mode_reglement'])) {
            $invoice->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $invoice->update($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::update update() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to update invoice: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Delete an invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'supprimer')) {
            dol_syslog("DPK InvoiceController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::destroy missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $result = $invoice->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::destroy delete() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to delete invoice: ' . $invoice->error], 500];
        }

        return [['message' => 'Invoice deleted'], 200];
    }

    /**
     * Validate (move from draft to validated) an invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::validate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::validate missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::validate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $result = $invoice->validate($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::validate validate() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to validate invoice: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Create an invoice from an existing order (commande -> facture).
     *
     * @param array|null $arr
     * @return array
     */
    public function createFromOrder($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::createFromOrder forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $orderid = isset($arr['orderid']) ? (int) $arr['orderid'] : 0;
        if ($orderid <= 0) {
            dol_syslog("DPK InvoiceController::createFromOrder missing orderid", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($orderid) <= 0) {
            dol_syslog("DPK InvoiceController::createFromOrder order not found id=" . $orderid, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }
        $cmd->fetch_lines();

        $invoice = new Facture($db);
        $result = $invoice->createFromOrder($cmd, $user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::createFromOrder createFromOrder() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to create invoice from order: ' . $invoice->error], 500];
        }

        $invoice->fetch($result);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 201];
    }

    /**
     * Add a line to an invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::addLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::addLine missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::addLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $desc = isset($arr['description']) ? (string) $arr['description'] : (isset($arr['label']) ? (string) $arr['label'] : '');
        $pu_ht = isset($arr['subprice']) ? (float) $arr['subprice'] : 0.0;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : 1.0;
        $txtva = isset($arr['tva_tx']) ? (string) $arr['tva_tx'] : '0';
        $fk_product = isset($arr['fk_product']) ? (int) $arr['fk_product'] : 0;
        $remise_percent = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : 0.0;
        $product_type = isset($arr['product_type']) ? (int) $arr['product_type'] : 0;
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : -1;

        $result = $invoice->addline(
            $desc,
            $pu_ht,
            $qty,
            $txtva,
            0,
            0,
            $fk_product,
            $remise_percent,
            '',
            '',
            0,
            0,
            '',
            'HT',
            0,
            $product_type,
            $rang,
            0,
            '',
            0,
            0,
            null,
            0,
            ''
        );
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::addLine addline() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to add line: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 201];
    }

    /**
     * Update a line of an invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function updateLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::updateLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK InvoiceController::updateLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Invoice id and line id are required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::updateLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        $invoice->fetch_lines();

        $existing = null;
        foreach ($invoice->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog("DPK InvoiceController::updateLine line not found lineid=" . $lineid, LOG_WARNING);
            return [['error' => 'Line not found'], 404];
        }

        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : (float) $existing->subprice;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : (float) $existing->qty;
        $remise_percent = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : (float) $existing->remise_percent;
        $txtva = isset($arr['tva_tx']) ? (string) $arr['tva_tx'] : (string) $existing->tva_tx;
        $desc = isset($arr['description']) ? (string) $arr['description'] : (string) $existing->desc;
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : (int) $existing->product_type;
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : (int) ($existing->rang ?? 0);

        $result = $invoice->updateline(
            $lineid,
            $desc,
            $pu,
            $qty,
            $remise_percent,
            '',
            '',
            $txtva,
            0,
            0,
            'HT',
            0,
            $type,
            0,
            0,
            null,
            0,
            '',
            0,
            0,
            100,
            null,
            0,
            0,
            '',
            $rang
        );
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::updateLine updateline() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to update line: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Delete a line from an invoice.
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::deleteLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK InvoiceController::deleteLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Invoice id and line id are required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::deleteLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $result = $invoice->deleteline($lineid, $id);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::deleteLine deleteline() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to delete line: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }
}
