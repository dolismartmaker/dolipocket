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

dol_include_once('/compta/facture/class/facture.class.php');
dol_include_once('/commande/class/commande.class.php');
dol_include_once('/compta/paiement/class/paiement.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/SendEmailTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaymentTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PdfDownloadTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmInvoice.php');

use Facture;
use Commande;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\SendEmailTrait;
use Dolipocket\Api\Trait\PaymentTrait;
use Dolipocket\Api\Trait\PdfDownloadTrait;
use Dolipocket\Api\Trait\DocumentContactTrait;
use Dolipocket\Api\Trait\DocumentLinkTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

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
    use SendEmailTrait;
    use PaymentTrait;
    use PdfDownloadTrait;
    use DocumentContactTrait;
    use DocumentLinkTrait;

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
     * GET invoice/lines/columns
     *
     * Returns the catalog describing the invoice-line columns. Cf
     * docs/DATATABLE_SPEC.md section 13.
     *
     * @param array|null $arr
     * @return array
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::linesColumns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET invoice/describe
     *
     * Returns the raw objectDesc() output (per-field metadata) for AutoForm.
     * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
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
        // Remain-to-pay must account for credit notes and deposits applied to
        // the invoice, not only recorded payments. getRemainToPay() is the
        // canonical Dolibarr computation (payments + deposits + credit notes,
        // with the discount_vat close-code special case). The previous
        // "total_ttc - payments" overstated the balance whenever a credit note
        // or a deposit was applied.
        $totalCreditNotes = (float) $invoice->getSumCreditNotesUsed();
        $totalDeposits = (float) $invoice->getSumDepositsUsed();
        $data->payments = $payments;
        $data->total_paid = $sum;
        $data->total_credit_notes = $totalCreditNotes;
        $data->total_deposits = $totalDeposits;
        $data->remain_to_pay = (float) $invoice->getRemainToPay();

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
        $datef = self::normalizeTimestamp($arr['datef'] ?? null);
        $invoice->date = $datef !== null ? $datef : dol_now();
        $invoice->datef = $invoice->date;
        $dateLimCreate = self::normalizeTimestamp($arr['date_lim_reglement'] ?? null);
        if ($dateLimCreate !== null) {
            $invoice->date_lim_reglement = $dateLimCreate;
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

        $payload = $arr;
        unset($payload['id']);

        // Pre-process date fields with the project-specific normalizer.
        // dmTrait::_castInputValue() handles strtotime() but normalizeTimestamp()
        // is more permissive (accepts JS Date.now() in ms, etc).
        foreach (['datef', 'date_lim_reglement'] as $dateField) {
            if (isset($payload[$dateField])) {
                $normalized = self::normalizeTimestamp($payload[$dateField]);
                if ($normalized !== null) {
                    $payload[$dateField] = $normalized;
                } else {
                    unset($payload[$dateField]);
                }
            }
        }

        try {
            $sanitized = $this->mapper->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK InvoiceController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk Dolibarr: on Facture, fk_cond_reglement / fk_mode_reglement
            // are stored on cond_reglement_id / mode_reglement_id PHP properties
            // (the SQL column keeps the fk_ prefix).
            if ($field === 'fk_cond_reglement') {
                $invoice->cond_reglement_id = $value;
                continue;
            }
            if ($field === 'fk_mode_reglement') {
                $invoice->mode_reglement_id = $value;
                continue;
            }
            // Quirk Dolibarr: datef must also land on $date (cf facture.class.php
            // line 2544 -- update() reads $this->date for the SQL `datef` column).
            if ($field === 'datef') {
                $invoice->date = $value;
                $invoice->datef = $value;
                continue;
            }
            $invoice->$field = $value;
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
     * Set a validated invoice back to draft (status 0).
     *
     * @param array|null $arr
     * @return array
     */
    public function setDraft($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::setDraft forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::setDraft missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::setDraft not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $result = $invoice->setDraft($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::setDraft setDraft() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to set invoice back to draft: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Classify an invoice as paid (status 2). Optional close_code /
     * close_note describe a non-standard settlement (discount, bad debt...).
     *
     * @param array|null $arr
     * @return array
     */
    public function setPaid($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::setPaid forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::setPaid missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::setPaid not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $closeCode = isset($arr['close_code']) ? (string) $arr['close_code'] : '';
        $closeNote = isset($arr['close_note']) ? (string) $arr['close_note'] : '';
        $result = $invoice->setPaid($user, $closeCode, $closeNote);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::setPaid setPaid() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to classify invoice as paid: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Revert a paid/abandoned invoice back to validated/unpaid (status 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function setUnpaid($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::setUnpaid forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::setUnpaid missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::setUnpaid not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $result = $invoice->setUnpaid($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::setUnpaid setUnpaid() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to set invoice as unpaid: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Classify an invoice as abandoned (status 3). Optional close_code /
     * close_note record the reason.
     *
     * @param array|null $arr
     * @return array
     */
    public function setCanceled($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::setCanceled forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::setCanceled missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::setCanceled not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $closeCode = isset($arr['close_code']) ? (string) $arr['close_code'] : '';
        $closeNote = isset($arr['close_note']) ? (string) $arr['close_note'] : '';
        $result = $invoice->setCanceled($user, $closeCode, $closeNote);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::setCanceled setCanceled() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to classify invoice as abandoned: ' . $invoice->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * Duplicate an invoice (Dolibarr createFromClone). Returns the new draft.
     *
     * @param array|null $arr
     * @return array
     */
    public function cloneDocument($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::cloneDocument forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::cloneDocument missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::cloneDocument not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $newId = $invoice->createFromClone($user, $invoice->id);
        if ($newId <= 0) {
            dol_syslog("DPK InvoiceController::cloneDocument createFromClone() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to clone invoice: ' . $invoice->error], 500];
        }

        $clone = new Facture($db);
        $clone->fetch($newId);
        $clone->fetch_lines();
        return [$this->mapper->exportMappedData($clone), 201];
    }

    /** Wiring for the shared DocumentContactTrait (Contacts/addresses tab). */
    private function contactConfig()
    {
        return [
            'class'         => '\\Facture',
            'permGroup'     => 'facture',
            'logTag'        => 'InvoiceController',
            'notFoundLabel' => 'Invoice',
        ];
    }

    /** GET invoice/{id}/contacts -- linked contacts + available types. */
    public function contacts($arr = null)
    {
        return $this->listContacts($arr, $this->contactConfig());
    }

    /** POST invoice/{id}/contact -- link a contact. */
    public function contactAdd($arr = null)
    {
        return $this->addContact($arr, $this->contactConfig());
    }

    /** DELETE invoice/{id}/contact/{rowid} -- unlink a contact. */
    public function contactRemove($arr = null)
    {
        return $this->removeContact($arr, $this->contactConfig());
    }

    /** GET invoice/{id}/links -- linked objects (document chain). */
    public function links($arr = null)
    {
        return $this->listLinks($arr, $this->contactConfig());
    }

    /** DELETE invoice/{id}/link/{rowid} -- unlink a related object. */
    public function linkRemove($arr = null)
    {
        return $this->removeLink($arr, $this->contactConfig());
    }

    /**
     * GET invoice/{id}/creditnotes -- credit notes / replacements derived from
     * this invoice, plus the source invoice when this one is itself a credit
     * note. Read only.
     *
     * @param array|null $arr
     * @return array
     */
    public function creditNotes($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::creditNotes forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::creditNotes missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::creditNotes not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $list = array();
        $sql = "SELECT rowid, ref, type, total_ttc, fk_statut, paye FROM " . MAIN_DB_PREFIX . "facture";
        $sql .= " WHERE fk_facture_source = " . ((int) $id);
        $sql .= " AND entity IN (" . getEntity('facture') . ")";
        $sql .= " ORDER BY rowid";
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $list[] = array(
                    'id'       => (int) $obj->rowid,
                    'ref'      => $obj->ref,
                    'type'     => (int) $obj->type,
                    'totalTtc' => (float) $obj->total_ttc,
                    'statut'   => (int) $obj->fk_statut,
                    'paye'     => (int) $obj->paye,
                );
            }
        } else {
            dol_syslog("DPK InvoiceController::creditNotes query failed: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list credit notes'], 500];
        }

        $source = null;
        if ((int) $invoice->type === Facture::TYPE_CREDIT_NOTE && (int) $invoice->fk_facture_source > 0) {
            $src = new Facture($db);
            if ($src->fetch((int) $invoice->fk_facture_source) > 0) {
                $source = array('id' => (int) $src->id, 'ref' => $src->ref);
            }
        }

        return [array(
            'creditNotes'   => $list,
            'sourceInvoice' => $source,
            'selfType'      => (int) $invoice->type,
        ), 200];
    }

    /**
     * POST invoice/{id}/creditnote -- create a draft credit note (avoir) from a
     * validated standard invoice, copying the lines with inverted amounts. This
     * mirrors the Dolibarr "Creer un avoir" flow (compta/facture/card.php).
     * Situation invoices are out of scope (complex delta logic).
     *
     * @param array|null $arr
     * @return array
     */
    public function createCreditNote($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::createCreditNote forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::createCreditNote missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $source = new Facture($db);
        if ($source->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::createCreditNote source not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        $source->fetch_lines();

        if ((int) $source->type === Facture::TYPE_SITUATION) {
            dol_syslog("DPK InvoiceController::createCreditNote situation invoice not supported id=" . $id, LOG_WARNING);
            return [['error' => 'Credit notes from situation invoices are not supported'], 400];
        }
        if ((int) $source->statut < Facture::STATUS_VALIDATED) {
            dol_syslog("DPK InvoiceController::createCreditNote source not validated id=" . $id, LOG_WARNING);
            return [['error' => 'The source invoice must be validated first'], 400];
        }

        $db->begin();

        $object = new Facture($db);
        $object->socid = $source->socid;
        $object->type = Facture::TYPE_CREDIT_NOTE;
        $object->fk_facture_source = $source->id;
        $object->date = dol_now();
        $object->cond_reglement_id = $source->cond_reglement_id;
        $object->mode_reglement_id = $source->mode_reglement_id;
        $object->fk_account = $source->fk_account;
        $object->fk_project = $source->fk_project;
        $object->ref_client = $source->ref_client;
        $object->note_public = $source->note_public;
        $object->note_private = $source->note_private;
        $object->model_pdf = $source->model_pdf;

        $newId = $object->create($user);
        if ($newId <= 0) {
            dol_syslog("DPK InvoiceController::createCreditNote create() failed: " . $object->error, LOG_ERR);
            $db->rollback();
            return [['error' => 'Failed to create credit note: ' . $object->error], 500];
        }

        // Copy internal + external (same company) contacts like Dolibarr does.
        $object->copy_linked_contact($source, 'internal');
        if ((int) $source->socid === (int) $object->socid) {
            $object->copy_linked_contact($source, 'external');
        }

        // Copy the source lines with inverted amounts (cf card.php credit note).
        if (is_array($source->lines)) {
            $fkParentLine = 0;
            foreach ($source->lines as $line) {
                if (method_exists($line, 'fetch_optionals')) {
                    $line->fetch_optionals();
                }
                if (($line->product_type != 9 && empty($line->fk_parent_line)) || $line->product_type == 9) {
                    $fkParentLine = 0;
                }

                $line->fk_facture = $object->id;
                $line->fk_parent_line = $fkParentLine;

                $line->subprice = -$line->subprice;
                $line->total_ht = -$line->total_ht;
                $line->total_tva = -$line->total_tva;
                $line->total_ttc = -$line->total_ttc;
                $line->total_localtax1 = -$line->total_localtax1;
                $line->total_localtax2 = -$line->total_localtax2;
                $line->multicurrency_subprice = -$line->multicurrency_subprice;
                $line->multicurrency_total_ht = -$line->multicurrency_total_ht;
                $line->multicurrency_total_tva = -$line->multicurrency_total_tva;
                $line->multicurrency_total_ttc = -$line->multicurrency_total_ttc;

                $line->context['createcreditnotefrominvoice'] = 1;
                $res = $line->insert(0, 1);
                if ($res < 0) {
                    dol_syslog("DPK InvoiceController::createCreditNote line insert failed: " . $line->error, LOG_ERR);
                    $db->rollback();
                    return [['error' => 'Failed to copy invoice line: ' . $line->error], 500];
                }
                $object->lines[] = $line;
                if ($res > 0 && (int) $line->product_type === 9) {
                    $fkParentLine = $res;
                }
            }
            $object->update_price(1);
        }

        $db->commit();

        $object->fetch($newId);
        $object->fetch_lines();
        return [$this->mapper->exportMappedData($object), 201];
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
     * GET invoice/deposit-terms -- Tier A lot A5a.
     *
     * List the payment terms eligible for a deposit: those whose c_payment_term
     * dictionary row defines a deposit_percent. The "create deposit invoice"
     * flow needs one of these, because Facture::createDepositFromOrigin()
     * refuses an origin whose payment condition is not deposit-capable.
     *
     * @param array|null $arr
     * @return array
     */
    public function depositTerms($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::depositTerms forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $sql = "SELECT rowid, code, libelle, deposit_percent";
        $sql .= " FROM " . MAIN_DB_PREFIX . "c_payment_term";
        $sql .= " WHERE active = 1";
        $sql .= " AND deposit_percent IS NOT NULL AND deposit_percent <> '' AND deposit_percent <> 0";
        $sql .= " AND entity IN (" . getEntity('c_payment_term') . ")";
        $sql .= " ORDER BY libelle";

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceController::depositTerms SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $terms = [];
        while ($obj = $db->fetch_object($resql)) {
            $terms[] = array(
                'id'             => (int) $obj->rowid,
                'code'           => $obj->code,
                'label'          => $obj->libelle,
                'depositPercent' => (float) $obj->deposit_percent,
            );
        }
        $db->free($resql);

        return [['terms' => $terms], 200];
    }

    /**
     * POST invoice/deposit -- create a deposit invoice (TYPE_DEPOSIT) from a
     * proposal or order. Tier A lot A5a.
     *
     * Faithful to commande/card.php "generate_deposit": the deposit percentage
     * is carried on $origin->deposit_percent and the eligibility comes from a
     * deposit-capable payment term. We set both in memory only (no persistence
     * on the origin), exactly what createDepositFromOrigin() reads. Dolibarr
     * computes the deposit amounts and lines itself -- this controller never
     * derives a financial amount on its own.
     *
     * Body:
     *   - origin_type       ('propal'|'commande', required)
     *   - origin_id         (int, required)
     *   - cond_reglement_id (int, required) a deposit-eligible payment term
     *   - deposit_percent   (float, required) the deposit percentage to apply
     *   - date              (optional) invoice date (s or ms; defaults to now)
     *
     * @param array|null $arr
     * @return array
     */
    public function createDeposit($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::createDeposit forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $originType = isset($arr['origin_type']) ? (string) $arr['origin_type'] : '';
        $originId = isset($arr['origin_id']) ? (int) $arr['origin_id'] : 0;
        $condReglementId = isset($arr['cond_reglement_id']) ? (int) $arr['cond_reglement_id'] : 0;
        $depositPercent = isset($arr['deposit_percent']) ? (float) $arr['deposit_percent'] : 0;

        if (!in_array($originType, array('propal', 'commande'), true)) {
            dol_syslog("DPK InvoiceController::createDeposit invalid origin_type=" . $originType, LOG_WARNING);
            return [['error' => "origin_type must be 'propal' or 'commande'"], 400];
        }
        if ($originId <= 0) {
            dol_syslog("DPK InvoiceController::createDeposit missing origin_id", LOG_WARNING);
            return [['error' => 'origin_id is required'], 400];
        }
        if ($condReglementId <= 0) {
            dol_syslog("DPK InvoiceController::createDeposit missing cond_reglement_id", LOG_WARNING);
            return [['error' => 'cond_reglement_id (a deposit-eligible payment term) is required'], 400];
        }
        if ($depositPercent <= 0) {
            dol_syslog("DPK InvoiceController::createDeposit invalid deposit_percent", LOG_WARNING);
            return [['error' => 'deposit_percent must be greater than 0'], 400];
        }

        if ($originType === 'commande') {
            $origin = new Commande($db);
        } else {
            require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
            $origin = new \Propal($db);
        }
        if ($origin->fetch($originId) <= 0) {
            dol_syslog("DPK InvoiceController::createDeposit origin not found type=" . $originType . " id=" . $originId, LOG_WARNING);
            return [['error' => 'Origin document not found'], 404];
        }
        $origin->fetch_lines();

        // In-memory deposit setup (mirrors card.php setPaymentTerms but without
        // persisting it on the origin): createDepositFromOrigin reads these.
        $origin->cond_reglement_id = $condReglementId;
        $origin->deposit_percent = $depositPercent;

        $date = self::normalizeTimestamp($arr['date'] ?? null);
        if ($date === null) {
            $date = dol_now();
        }

        $deposit = \Facture::createDepositFromOrigin($origin, $date, $condReglementId, $user);
        if (!is_object($deposit) || empty($deposit->id)) {
            $reason = (!empty($origin->error)) ? $origin->error : 'Failed to create deposit invoice';
            dol_syslog("DPK InvoiceController::createDeposit createDepositFromOrigin() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to create deposit invoice: ' . $reason], 400];
        }

        $deposit->fetch($deposit->id);
        $deposit->fetch_lines();
        return [$this->mapper->exportMappedData($deposit), 201];
    }

    /**
     * POST invoice/{id}/converttoreduc -- Tier A lot A5c.
     *
     * Convert a credit note, a deposit invoice or a standard/situation invoice
     * with excess received into one or more reusable absolute discounts
     * (DiscountAbsolute / societe_remise_except), one per VAT rate. This is a
     * faithful, line-by-line replica of compta/facture/card.php action
     * "confirm_converttoreduc" (lines 821-982 in Dolibarr 18). No amount is ever
     * derived here outside what card.php computes: VAT amounts are summed per
     * rate, taken in absolute value, and a discount row is created per rate;
     * for a standard invoice the discount is the TTC excess received.
     *
     * Eligibility ($canconvert) is reproduced exactly:
     *   - deposit: type == TYPE_DEPOSIT and no discount already created
     *   - credit note / standard / situation: paye == 0 and no discount yet
     *
     * @param array|null $arr
     * @return array
     */
    public function convertToReduc($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::convertToReduc forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::convertToReduc missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::convertToReduc not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        $invoice->fetch_lines();
        $invoice->fetch_thirdparty();

        require_once DOL_DOCUMENT_ROOT . '/core/class/discount.class.php';

        // Protection against duplicate creation: a discount may already exist for
        // this source invoice (re-submit). card.php fetches by fk_facture_source.
        $discountcheck = new \DiscountAbsolute($db);
        $discountcheck->fetch(0, $invoice->id);

        $type = (int) $invoice->type;
        $canconvert = 0;
        if ($type === Facture::TYPE_DEPOSIT && empty($discountcheck->id)) {
            $canconvert = 1;
        }
        if (in_array($type, array(Facture::TYPE_CREDIT_NOTE, Facture::TYPE_STANDARD, Facture::TYPE_SITUATION), true)
            && (int) $invoice->paye === 0 && empty($discountcheck->id)) {
            $canconvert = 1;
        }
        if (!$canconvert) {
            dol_syslog("DPK InvoiceController::convertToReduc not eligible id=" . $id
                . " type=" . $type . " paye=" . $invoice->paye
                . " existingDiscount=" . (int) $discountcheck->id, LOG_WARNING);
            return [['error' => 'This invoice cannot be converted into a discount (wrong type, already paid, or already converted)'], 400];
        }

        $db->begin();

        $amount_ht = $amount_tva = $amount_ttc = array();
        $multicurrency_amount_ht = $multicurrency_amount_tva = $multicurrency_amount_ttc = array();

        // Sum amounts per VAT rate (keyed by tva_tx plus an optional vat source
        // code, exactly like card.php $keyforvatrate). Skip lines with
        // product_type >= 9 (titles / sub-totals) and zero-HT lines.
        foreach ($invoice->lines as $line) {
            if ($line->product_type < 9 && $line->total_ht != 0) {
                $keyforvatrate = $line->tva_tx . ($line->vat_src_code ? ' (' . $line->vat_src_code . ')' : '');

                $amount_ht[$keyforvatrate] = ($amount_ht[$keyforvatrate] ?? 0) + $line->total_ht;
                $amount_tva[$keyforvatrate] = ($amount_tva[$keyforvatrate] ?? 0) + $line->total_tva;
                $amount_ttc[$keyforvatrate] = ($amount_ttc[$keyforvatrate] ?? 0) + $line->total_ttc;
                $multicurrency_amount_ht[$keyforvatrate] = ($multicurrency_amount_ht[$keyforvatrate] ?? 0) + $line->multicurrency_total_ht;
                $multicurrency_amount_tva[$keyforvatrate] = ($multicurrency_amount_tva[$keyforvatrate] ?? 0) + $line->multicurrency_total_tva;
                $multicurrency_amount_ttc[$keyforvatrate] = ($multicurrency_amount_ttc[$keyforvatrate] ?? 0) + $line->multicurrency_total_ttc;
            }
        }

        // Partial-refund prorate (conf-guarded, default OFF) -- faithful to
        // card.php: only for credit notes when INVOICE_ALLOW_REUSE_OF_CREDIT_WHEN_PARTIALLY_REFUNDED.
        if (!empty($conf->global->INVOICE_ALLOW_REUSE_OF_CREDIT_WHEN_PARTIALLY_REFUNDED) && $type === Facture::TYPE_CREDIT_NOTE) {
            $alreadypaid = $invoice->getSommePaiement();
            if ($alreadypaid && abs($alreadypaid) < abs($invoice->total_ttc)) {
                $ratio = abs(($invoice->total_ttc - $alreadypaid) / $invoice->total_ttc);
                foreach ($amount_ht as $vatrate => $val) {
                    $amount_ht[$vatrate] = price2num($amount_ht[$vatrate] * $ratio, 'MU');
                    $amount_tva[$vatrate] = price2num($amount_tva[$vatrate] * $ratio, 'MU');
                    $amount_ttc[$vatrate] = price2num($amount_ttc[$vatrate] * $ratio, 'MU');
                    $multicurrency_amount_ht[$vatrate] = price2num($multicurrency_amount_ht[$vatrate] * $ratio, 'MU');
                    $multicurrency_amount_tva[$vatrate] = price2num($multicurrency_amount_tva[$vatrate] * $ratio, 'MU');
                    $multicurrency_amount_ttc[$vatrate] = price2num($multicurrency_amount_ttc[$vatrate] * $ratio, 'MU');
                }
            }
        }

        // One discount object reused for every VAT-rate row (card.php pattern).
        $discount = new \DiscountAbsolute($db);
        if ($type === Facture::TYPE_CREDIT_NOTE) {
            $discount->description = '(CREDIT_NOTE)';
        } elseif ($type === Facture::TYPE_DEPOSIT) {
            $discount->description = '(DEPOSIT)';
        } elseif (in_array($type, array(Facture::TYPE_STANDARD, Facture::TYPE_REPLACEMENT, Facture::TYPE_SITUATION), true)) {
            $discount->description = '(EXCESS RECEIVED)';
        } else {
            $db->rollback();
            dol_syslog("DPK InvoiceController::convertToReduc unsupported type id=" . $id . " type=" . $type, LOG_ERR);
            return [['error' => 'Cannot convert an invoice of this type into a discount'], 400];
        }
        $discount->fk_soc = $invoice->socid;
        $discount->fk_facture_source = $invoice->id;

        $error = 0;

        if (in_array($type, array(Facture::TYPE_STANDARD, Facture::TYPE_REPLACEMENT, Facture::TYPE_SITUATION), true)) {
            // Standard invoice with excess received -> single TTC discount, no VAT.
            $sql = 'SELECT SUM(pf.amount) as total_paiements';
            $sql .= ' FROM ' . MAIN_DB_PREFIX . 'paiement_facture as pf, ' . MAIN_DB_PREFIX . 'paiement as p';
            $sql .= ' LEFT JOIN ' . MAIN_DB_PREFIX . 'c_paiement as c ON p.fk_paiement = c.id';
            $sql .= ' WHERE pf.fk_facture = ' . ((int) $invoice->id);
            $sql .= ' AND pf.fk_paiement = p.rowid';
            $sql .= ' AND p.entity IN (' . getEntity('invoice') . ')';
            $resql = $db->query($sql);
            if (!$resql) {
                $db->rollback();
                dol_syslog("DPK InvoiceController::convertToReduc payments SQL error: " . $db->lasterror(), LOG_ERR);
                return [['error' => 'Database error'], 500];
            }
            $res = $db->fetch_object($resql);
            $total_paiements = $res ? $res->total_paiements : 0;

            $total_creditnote_and_deposit = 0;
            $sql = "SELECT re.amount_ttc FROM " . MAIN_DB_PREFIX . "societe_remise_except as re";
            $sql .= " WHERE re.fk_facture = " . ((int) $invoice->id);
            $resql = $db->query($sql);
            if (!$resql) {
                $db->rollback();
                dol_syslog("DPK InvoiceController::convertToReduc remise SQL error: " . $db->lasterror(), LOG_ERR);
                return [['error' => 'Database error'], 500];
            }
            while ($obj = $db->fetch_object($resql)) {
                $total_creditnote_and_deposit += $obj->amount_ttc;
            }

            $discount->amount_ht = $discount->amount_ttc = $total_paiements + $total_creditnote_and_deposit - $invoice->total_ttc;
            $discount->amount_tva = 0;
            $discount->tva_tx = 0;
            $discount->vat_src_code = '';

            $result = $discount->create($user);
            if ($result < 0) {
                $error++;
            }
        }
        if (in_array($type, array(Facture::TYPE_CREDIT_NOTE, Facture::TYPE_DEPOSIT), true)) {
            foreach ($amount_ht as $tva_tx => $xxx) {
                $discount->amount_ht = abs($amount_ht[$tva_tx]);
                $discount->amount_tva = abs($amount_tva[$tva_tx]);
                $discount->amount_ttc = abs($amount_ttc[$tva_tx]);
                $discount->multicurrency_amount_ht = abs($multicurrency_amount_ht[$tva_tx]);
                $discount->multicurrency_amount_tva = abs($multicurrency_amount_tva[$tva_tx]);
                $discount->multicurrency_amount_ttc = abs($multicurrency_amount_ttc[$tva_tx]);

                // Split the composite key back into rate + vat source code.
                $reg = array();
                $vat_src_code = '';
                $tva_tx_clean = (string) $tva_tx;
                if (preg_match('/\((.*)\)/', (string) $tva_tx, $reg)) {
                    $vat_src_code = $reg[1];
                    $tva_tx_clean = preg_replace('/\s*\(.*\)/', '', (string) $tva_tx);
                }
                $discount->tva_tx = abs((float) $tva_tx_clean);
                $discount->vat_src_code = $vat_src_code;

                $result = $discount->create($user);
                if ($result < 0) {
                    $error++;
                    break;
                }
            }
        }

        if (empty($error)) {
            if ($type !== Facture::TYPE_DEPOSIT) {
                // Classify the source invoice as paid (settled via the discount).
                $result = $invoice->setPaid($user);
                if ($result >= 0) {
                    $db->commit();
                } else {
                    $db->rollback();
                    dol_syslog("DPK InvoiceController::convertToReduc setPaid() failed id=" . $id . ": " . $invoice->error, LOG_ERR);
                    return [['error' => 'Could not classify the source invoice as paid: ' . $invoice->error], 500];
                }
            } else {
                $db->commit();
            }
        } else {
            $db->rollback();
            dol_syslog("DPK InvoiceController::convertToReduc discount create failed id=" . $id . ": " . $discount->error, LOG_ERR);
            return [['error' => 'Failed to create discount: ' . $discount->error], 500];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * GET invoice/{id}/discounts -- Tier A lot A5c.
     *
     * List the reusable absolute discounts currently APPLIED to this invoice,
     * either as a negative line (fk_facture_line in the invoice lines) or as a
     * payment (fk_facture = id). Read only -- the "available" discounts of the
     * thirdparty are served by GET thirdparty/{id}/discounts.
     *
     * @param array|null $arr
     * @return array
     */
    public function appliedDiscounts($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::appliedDiscounts forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::appliedDiscounts missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::appliedDiscounts not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        $sql = "SELECT re.rowid, re.amount_ht, re.amount_ttc, re.tva_tx, re.description,";
        $sql .= " re.fk_facture, re.fk_facture_line, re.fk_facture_source, f.ref as ref_source";
        $sql .= " FROM " . MAIN_DB_PREFIX . "societe_remise_except as re";
        $sql .= " LEFT JOIN " . MAIN_DB_PREFIX . "facture as f ON re.fk_facture_source = f.rowid";
        $sql .= " WHERE re.entity IN (" . getEntity('invoice') . ")";
        $sql .= " AND re.discount_type = 0";
        $sql .= " AND (re.fk_facture = " . ((int) $id);
        $sql .= " OR re.fk_facture_line IN (SELECT fd.rowid FROM " . MAIN_DB_PREFIX . "facturedet as fd WHERE fd.fk_facture = " . ((int) $id) . "))";
        $sql .= " ORDER BY re.rowid";

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceController::appliedDiscounts query failed: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list applied discounts'], 500];
        }

        $applied = array();
        while ($obj = $db->fetch_object($resql)) {
            $applied[] = array(
                'id'               => (int) $obj->rowid,
                'type'             => self::classifyDiscountType((string) $obj->description),
                'appliedAs'        => !empty($obj->fk_facture_line) ? 'line' : 'payment',
                'description'      => (string) $obj->description,
                'amountHt'         => (float) $obj->amount_ht,
                'amountTtc'        => (float) $obj->amount_ttc,
                'tvaTx'            => (float) $obj->tva_tx,
                'sourceInvoiceId'  => !empty($obj->fk_facture_source) ? (int) $obj->fk_facture_source : 0,
                'sourceInvoiceRef' => $obj->ref_source !== null ? (string) $obj->ref_source : '',
            );
        }
        $db->free($resql);

        return [['applied' => $applied], 200];
    }

    /**
     * Classify a societe_remise_except description marker into a short type.
     * Shared by InvoiceController and ThirdPartyController.
     *
     * @param string $description
     * @return string one of credit_note|excess|deposit|discount
     */
    public static function classifyDiscountType($description)
    {
        if (strpos($description, '(CREDIT_NOTE)') !== false) {
            return 'credit_note';
        }
        if (strpos($description, '(EXCESS RECEIVED)') !== false) {
            return 'excess';
        }
        if (strpos($description, '(DEPOSIT)') !== false) {
            return 'deposit';
        }
        return 'discount';
    }

    /**
     * POST invoice/{id}/discount -- Tier A lot A5c.
     *
     * Apply an available absolute discount onto a DRAFT invoice as a NEGATIVE
     * invoice line (Facture::insert_discount). Mirrors card.php action
     * "setabsolutediscount" (POST field remise_id). insert_discount returns 1 on
     * success, a negative code on failure (-5 = discount already consumed).
     *
     * Body: discount_id (int, required) = rowid of the DiscountAbsolute.
     *
     * @param array|null $arr
     * @return array
     */
    public function applyDiscount($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::applyDiscount forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $discountId = isset($arr['discount_id']) ? (int) $arr['discount_id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::applyDiscount missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }
        if ($discountId <= 0) {
            dol_syslog("DPK InvoiceController::applyDiscount missing discount_id", LOG_WARNING);
            return [['error' => 'discount_id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::applyDiscount not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        if ((int) $invoice->statut !== Facture::STATUS_DRAFT) {
            dol_syslog("DPK InvoiceController::applyDiscount invoice not draft id=" . $id . " statut=" . $invoice->statut, LOG_WARNING);
            return [['error' => 'A discount can only be applied as a line on a draft invoice'], 400];
        }

        require_once DOL_DOCUMENT_ROOT . '/core/class/discount.class.php';
        $discount = new \DiscountAbsolute($db);
        if ($discount->fetch($discountId) <= 0) {
            dol_syslog("DPK InvoiceController::applyDiscount discount not found rowid=" . $discountId, LOG_WARNING);
            return [['error' => 'Discount not found'], 404];
        }
        if ((int) $discount->fk_soc !== (int) $invoice->socid) {
            dol_syslog("DPK InvoiceController::applyDiscount socid mismatch discount=" . $discountId . " invoiceSoc=" . $invoice->socid, LOG_WARNING);
            return [['error' => 'Discount does not belong to this invoice thirdparty'], 403];
        }

        $result = $invoice->insert_discount($discountId);
        if ($result < 0) {
            dol_syslog("DPK InvoiceController::applyDiscount insert_discount() failed id=" . $id
                . " discount=" . $discountId . " code=" . $result . ": " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to apply discount: ' . $invoice->error], 400];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * POST invoice/{id}/usecreditnote -- Tier A lot A5c.
     *
     * Apply an available credit note (or excess-received) discount onto a
     * VALIDATED unpaid invoice as a PAYMENT (DiscountAbsolute::link_to_invoice).
     * Mirrors card.php action "setabsolutediscount" (POST field
     * remise_id_for_payment) and api_invoices::useCreditNote. The display
     * condition in core/tpl/object_discounts.tpl.php gates this on a validated
     * invoice that is not itself a credit note.
     *
     * Body: discount_id (int, required) = rowid of the DiscountAbsolute.
     *
     * @param array|null $arr
     * @return array
     */
    public function useCreditNote($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::useCreditNote forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $discountId = isset($arr['discount_id']) ? (int) $arr['discount_id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::useCreditNote missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }
        if ($discountId <= 0) {
            dol_syslog("DPK InvoiceController::useCreditNote missing discount_id", LOG_WARNING);
            return [['error' => 'discount_id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::useCreditNote not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        if ((int) $invoice->statut !== Facture::STATUS_VALIDATED) {
            dol_syslog("DPK InvoiceController::useCreditNote invoice not validated id=" . $id . " statut=" . $invoice->statut, LOG_WARNING);
            return [['error' => 'A credit note can only be applied as a payment on a validated invoice'], 400];
        }
        if ((int) $invoice->type === Facture::TYPE_CREDIT_NOTE) {
            dol_syslog("DPK InvoiceController::useCreditNote target is a credit note id=" . $id, LOG_WARNING);
            return [['error' => 'Cannot apply a credit note onto another credit note'], 400];
        }
        if ((int) $invoice->paye) {
            dol_syslog("DPK InvoiceController::useCreditNote invoice already paid id=" . $id, LOG_WARNING);
            return [['error' => 'The invoice is already paid'], 400];
        }

        require_once DOL_DOCUMENT_ROOT . '/core/class/discount.class.php';
        $discount = new \DiscountAbsolute($db);
        if ($discount->fetch($discountId) <= 0) {
            dol_syslog("DPK InvoiceController::useCreditNote discount not found rowid=" . $discountId, LOG_WARNING);
            return [['error' => 'Credit note not found'], 404];
        }
        if ((int) $discount->fk_soc !== (int) $invoice->socid) {
            dol_syslog("DPK InvoiceController::useCreditNote socid mismatch discount=" . $discountId . " invoiceSoc=" . $invoice->socid, LOG_WARNING);
            return [['error' => 'Credit note does not belong to this invoice thirdparty'], 403];
        }
        if (!empty($discount->fk_facture) || !empty($discount->fk_facture_line)) {
            dol_syslog("DPK InvoiceController::useCreditNote discount already used rowid=" . $discountId, LOG_WARNING);
            return [['error' => 'This credit is already used'], 400];
        }

        $result = $discount->link_to_invoice(0, $id);
        if ($result < 0) {
            dol_syslog("DPK InvoiceController::useCreditNote link_to_invoice() failed id=" . $id
                . " discount=" . $discountId . ": " . $discount->error, LOG_ERR);
            return [['error' => 'Failed to apply credit note: ' . $discount->error], 400];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
    }

    /**
     * DELETE invoice/{id}/discount/{rowid} -- Tier A lot A5c.
     *
     * Remove a discount applied to this invoice, symmetric to applyDiscount /
     * useCreditNote:
     *   - applied as a LINE (fk_facture_line set): delete the carrying line via
     *     Facture::deleteline (draft only; deleteline frees the discount by
     *     setting fk_facture_line = NULL through FactureLigne::delete).
     *   - applied as a PAYMENT (fk_facture set): DiscountAbsolute::unlink_invoice
     *     frees fk_facture (only while the invoice is not yet fully paid).
     *
     * @param array|null $arr
     * @return array
     */
    public function removeDiscount($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceController::removeDiscount forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $rowid = isset($arr['rowid']) ? (int) $arr['rowid'] : 0;
        if ($id <= 0 || $rowid <= 0) {
            dol_syslog("DPK InvoiceController::removeDiscount missing id or rowid", LOG_WARNING);
            return [['error' => 'Invoice id and discount rowid are required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::removeDiscount not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/core/class/discount.class.php';
        $discount = new \DiscountAbsolute($db);
        if ($discount->fetch($rowid) <= 0) {
            dol_syslog("DPK InvoiceController::removeDiscount discount not found rowid=" . $rowid, LOG_WARNING);
            return [['error' => 'Discount not found'], 404];
        }
        if ((int) $discount->fk_soc !== (int) $invoice->socid) {
            dol_syslog("DPK InvoiceController::removeDiscount socid mismatch discount=" . $rowid . " invoiceSoc=" . $invoice->socid, LOG_WARNING);
            return [['error' => 'Discount does not belong to this invoice thirdparty'], 403];
        }

        if (!empty($discount->fk_facture_line)) {
            // Applied as a line: find the carrying line on this invoice and delete
            // it (draft only). deleteline frees the discount.
            if ((int) $invoice->statut !== Facture::STATUS_DRAFT) {
                dol_syslog("DPK InvoiceController::removeDiscount invoice not draft id=" . $id, LOG_WARNING);
                return [['error' => 'The invoice must be a draft to remove a discount line'], 400];
            }
            $invoice->fetch_lines();
            $lineId = 0;
            foreach ($invoice->lines as $line) {
                if ((int) ($line->fk_remise_except ?? 0) === $rowid) {
                    $lineId = (int) $line->id;
                    break;
                }
            }
            if ($lineId <= 0) {
                dol_syslog("DPK InvoiceController::removeDiscount line not found on invoice id=" . $id . " discount=" . $rowid, LOG_WARNING);
                return [['error' => 'This discount is not applied as a line on this invoice'], 400];
            }
            $res = $invoice->deleteline($lineId, $id);
            if ($res <= 0) {
                dol_syslog("DPK InvoiceController::removeDiscount deleteline() failed id=" . $id . " line=" . $lineId . ": " . $invoice->error, LOG_ERR);
                return [['error' => 'Failed to remove discount line: ' . $invoice->error], 400];
            }
        } elseif (!empty($discount->fk_facture)) {
            // Applied as a payment: must target this invoice and not be paid yet.
            if ((int) $discount->fk_facture !== $id) {
                dol_syslog("DPK InvoiceController::removeDiscount credit applied to another invoice discount=" . $rowid, LOG_WARNING);
                return [['error' => 'This credit is applied to another invoice'], 403];
            }
            if ((int) $invoice->paye) {
                dol_syslog("DPK InvoiceController::removeDiscount invoice already paid id=" . $id, LOG_WARNING);
                return [['error' => 'The invoice is already paid; cannot remove the applied credit'], 400];
            }
            $res = $discount->unlink_invoice();
            if ($res < 0) {
                dol_syslog("DPK InvoiceController::removeDiscount unlink_invoice() failed id=" . $id . " discount=" . $rowid . ": " . $discount->error, LOG_ERR);
                return [['error' => 'Failed to remove applied credit note: ' . $discount->error], 400];
            }
        } else {
            dol_syslog("DPK InvoiceController::removeDiscount discount not applied rowid=" . $rowid, LOG_WARNING);
            return [['error' => 'This discount is not applied to any invoice'], 400];
        }

        $invoice->fetch($id);
        $invoice->fetch_lines();
        return [$this->mapper->exportMappedData($invoice), 200];
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
        $label = isset($arr['label']) ? (string) $arr['label'] : '';
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : -1;
        // Section lines (Lot 11). product_type=9 + special_code=0 -> title,
        // product_type=9 + special_code=104 -> sub-total. Pure label, no
        // calculation (qty/subprice/tva_tx all 0).
        $special_code = isset($arr['special_code']) ? (int) $arr['special_code'] : 0;
        // Service-line dates (typed as Dolibarr dates -- normalised from
        // milliseconds / ISO strings via PaginatedListTrait::normalizeTimestamp).
        $dateStart = self::normalizeTimestamp($arr['date_start'] ?? null);
        $dateEnd = self::normalizeTimestamp($arr['date_end'] ?? null);
        if ($dateStart === null) $dateStart = '';
        if ($dateEnd === null) $dateEnd = '';
        $fk_unit = isset($arr['fk_unit']) && (int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null;

        // If a product was picked but description / subprice / tva_tx /
        // product_type / label were not supplied, hydrate them from the
        // product record. Mirrors what Dolibarr's standard "addline" form
        // does after a product is chosen via the prod_entry_mode=predef
        // radio (cf objectline_create.tpl.php).
        if ($fk_product > 0) {
            require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
            $product = new \Product($db);
            if ($product->fetch($fk_product) > 0) {
                if ($desc === '') {
                    $desc = (string) ($product->description !== '' ? $product->description : $product->label);
                }
                if ($label === '') {
                    $label = (string) $product->label;
                }
                if (!isset($arr['subprice'])) {
                    $pu_ht = (float) $product->price;
                }
                if (!isset($arr['tva_tx']) && $product->tva_tx !== null) {
                    $txtva = (string) $product->tva_tx;
                }
                if (!isset($arr['product_type'])) {
                    $product_type = (int) $product->type;
                }
                if ($fk_unit === null && !empty($product->fk_unit)) {
                    $fk_unit = (int) $product->fk_unit;
                }
            }
        }

        // Facture::addline signature (31 args):
        //   1 desc, 2 pu_ht, 3 qty, 4 txtva, 5 txlocaltax1,
        //   6 txlocaltax2, 7 fk_product, 8 remise_percent,
        //   9 date_start, 10 date_end, 11 ventil, 12 info_bits,
        //  13 fk_remise_except, 14 price_base_type, 15 pu_ttc,
        //  16 type, 17 rang, 18 special_code, 19 origin,
        //  20 origin_id, 21 fk_parent_line, 22 fk_fournprice,
        //  23 pa_ht, 24 label, 25 array_options, 26 situation_percent,
        //  27 fk_prev_id, 28 fk_unit, 29 pu_ht_devise, 30 ref_ext,
        //  31 noupdateafterinsertline
        $result = $invoice->addline(
            $desc,
            $pu_ht,
            $qty,
            $txtva,
            0,
            0,
            $fk_product,
            $remise_percent,
            $dateStart,
            $dateEnd,
            0,
            0,
            '',
            'HT',
            0,
            $product_type,
            $rang,
            $special_code,
            '',
            0,
            0,
            null,
            0,
            $label,
            0,
            100,
            0,
            $fk_unit
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
        $label = isset($arr['label']) ? (string) $arr['label'] : (string) ($existing->label ?? '');
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : (int) $existing->product_type;
        $rang = isset($arr['rang']) ? (int) $arr['rang'] : (int) ($existing->rang ?? 0);
        // Preserve special_code on section lines (Lot 11). Falls back to
        // existing line's value to avoid demoting sub-total / title rows.
        $special_code = isset($arr['special_code'])
            ? (int) $arr['special_code']
            : (int) ($existing->special_code ?? 0);
        // Service-line dates + unit -- normalised when present, otherwise
        // we keep the existing line's value (via empty string sentinel for
        // dates / null for fk_unit which Facture::updateline interprets as
        // "no change").
        $dateStart = array_key_exists('date_start', $arr) ? self::normalizeTimestamp($arr['date_start']) : (int) ($existing->date_start ?? 0);
        $dateEnd = array_key_exists('date_end', $arr) ? self::normalizeTimestamp($arr['date_end']) : (int) ($existing->date_end ?? 0);
        if ($dateStart === null) $dateStart = '';
        if ($dateEnd === null) $dateEnd = '';
        $fk_unit = array_key_exists('fk_unit', $arr)
            ? ((int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null)
            : (isset($existing->fk_unit) ? (int) $existing->fk_unit : null);

        // Facture::updateline signature (26 args):
        //   1 rowid, 2 desc, 3 pu, 4 qty, 5 remise_percent,
        //   6 date_start, 7 date_end, 8 txtva, 9 txlocaltax1,
        //  10 txlocaltax2, 11 price_base_type, 12 info_bits,
        //  13 type, 14 fk_parent_line, 15 skip_update_total,
        //  16 fk_fournprice, 17 pa_ht, 18 label, 19 special_code,
        //  20 array_options, 21 situation_percent, 22 fk_unit,
        //  23 pu_ht_devise, 24 notrigger, 25 ref_ext, 26 rang
        $result = $invoice->updateline(
            $lineid,
            $desc,
            $pu,
            $qty,
            $remise_percent,
            $dateStart,
            $dateEnd,
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
            $label,
            $special_code,
            0,
            100,
            $fk_unit,
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

    /**
     * POST invoice/{id}/pdf
     *
     * Generate the PDF document for the invoice using the configured
     * model (Dolibarr conf $conf->global->FACTURE_ADDON_PDF, falls back to
     * 'crabe'). Mirrors what the Dolibarr standard "(Re)generate" button
     * does on the invoice card.
     *
     * Body params:
     *   - model    (optional) -- override the PDF model name
     *   - lang     (optional) -- output language
     *   - hideref  / hidedesc / hidedetails (optional bool)
     *
     * Returns { ok, file } where `file` is the basename of the generated
     * PDF (saved under documents/<entity>/facture/<ref>/).
     *
     * @param array|null $arr
     * @return array
     */
    public function generatePdf($arr = null)
    {
        global $db, $user, $langs, $conf;

        if (!$user->hasRight('facture', 'creer') && !$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceController::generatePdf forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceController::generatePdf missing id", LOG_WARNING);
            return [['error' => 'Invoice id is required'], 400];
        }

        $invoice = new Facture($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceController::generatePdf not found id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice not found'], 404];
        }
        $invoice->fetch_lines();
        $invoice->fetch_thirdparty();

        $model = isset($arr['model']) && trim((string) $arr['model']) !== ''
            ? (string) $arr['model']
            : (string) (getDolGlobalString('FACTURE_ADDON_PDF') ?: 'crabe');
        $hideref = isset($arr['hideref']) ? (int) $arr['hideref'] : 0;
        $hidedesc = isset($arr['hidedesc']) ? (int) $arr['hidedesc'] : 0;
        $hidedetails = isset($arr['hidedetails']) ? (int) $arr['hidedetails'] : 0;

        $result = $invoice->generateDocument($model, $langs, $hidedetails, $hidedesc, $hideref);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceController::generatePdf generateDocument() failed: " . $invoice->error, LOG_ERR);
            return [['error' => 'Failed to generate PDF: ' . $invoice->error], 500];
        }

        return [
            ['ok' => true, 'file' => $invoice->last_main_doc ?? '', 'model' => $model],
            200,
        ];
    }

    /**
     * POST invoice/{id}/send
     *
     * Send the customer invoice by email with the last generated PDF attached.
     * Cf .claude/CLAUDE.md "Envoi par email" (todo.md task 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function send($arr = null)
    {
        return $this->sendEmail($arr, [
            'objectClass'   => '\\Facture',
            'permGroup'     => 'facture',
            'logTag'        => 'InvoiceController',
            'notFoundLabel' => 'Invoice',
            'defaultModel'  => 'crabe',
            'addonPdfKey'   => 'FACTURE_ADDON_PDF',
            'subjectPrefix' => 'Facture',
        ]);
    }

    /**
     * GET invoice/{id}/pdf/download
     *
     * Stream the last generated PDF for the customer invoice. Reads
     * $obj->last_main_doc; does NOT regenerate. Cf todo.md task 3.
     *
     * @param array|null $arr
     * @return array
     */
    public function download($arr = null)
    {
        return $this->downloadPdf($arr, [
            'objectClass'   => '\\Facture',
            'permGroup'     => 'facture',
            'logTag'        => 'InvoiceController',
            'notFoundLabel' => 'Invoice',
        ]);
    }

    /**
     * POST invoice/{id}/payment
     *
     * Record a customer payment against this invoice. Delegates to
     * PaymentTrait::addPayment which encapsulates Paiement::create + the
     * "close on full" flag so the invoice's `paye` flips automatically
     * when the running total reaches total_ttc.
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
            'invoiceClass'  => '\\Facture',
            'paymentClass'  => 'customer',
            'permGroup'     => 'facture',
            'logTag'        => 'InvoiceController',
            'notFoundLabel' => 'Invoice',
        ]);
    }
}
