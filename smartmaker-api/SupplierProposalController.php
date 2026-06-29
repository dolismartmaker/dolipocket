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

dol_include_once('/supplier_proposal/class/supplier_proposal.class.php');
dol_include_once('/product/class/product.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/DocumentLinkTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmSupplierProposal.php');

use SupplierProposal;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\DocumentLinkTrait;

/**
 * Supplier price request (SupplierProposal) API controller -- Tier A lot A3.
 *
 * Supplier-side counterpart of the customer proposal (devis): a full document
 * with editable lines. Created blank for a supplier, lines added/updated/
 * deleted while in draft, then validated and closed signed / not signed.
 *
 * Statuses: 0 draft, 1 validated, 2 signed, 3 not signed, 4 closed/billed.
 *
 * Routes (singular):
 *   GET    supplierproposal                 -> index (paginated + legacy)
 *   GET    supplierproposal/columns         -> columns
 *   GET    supplierproposal/lines/columns   -> linesColumns
 *   GET    supplierproposal/describe        -> describe
 *   GET    supplierproposal/count           -> count
 *   GET    supplierproposal/{id}            -> show
 *   POST   supplierproposal                 -> create
 *   PUT    supplierproposal/{id}            -> update
 *   DELETE supplierproposal                 -> deleteBulk
 *   DELETE supplierproposal/{id}            -> destroy
 *   POST   supplierproposal/{id}/validate   -> validate
 *   POST   supplierproposal/{id}/setdraft   -> setDraft
 *   POST   supplierproposal/{id}/closesign  -> closeSigned
 *   POST   supplierproposal/{id}/closeunsign -> closeUnsigned
 *   POST   supplierproposal/{id}/reopen     -> reopen
 *   POST   supplierproposal/{id}/clone      -> cloneDocument
 *   GET    supplierproposal/{id}/links      -> links
 *   DELETE supplierproposal/{id}/link/{rowid} -> linkRemove
 *   POST   supplierproposal/{id}/line       -> addLine
 *   PUT    supplierproposal/{id}/line/{lineid} -> updateLine
 *   DELETE supplierproposal/{id}/line/{lineid} -> deleteLine
 */
class SupplierProposalController
{
    use PaginatedListTrait;
    use DocumentLinkTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'sp.datec DESC, sp.rowid DESC';

    /**
     * @var dmSupplierProposal Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmSupplierProposal();
    }

    /**
     * Sortable API key -> SQL column whitelist (aliased on "sp"). Explicit map
     * (not catalog-driven) because mapper doliside keys are PHP property names
     * (statut, cond_reglement_id, date_creation) that differ from the
     * llx_supplier_proposal columns (fk_statut, fk_cond_reglement, datec).
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return [
            'ref'            => 'sp.ref',
            'socid'          => 'sp.fk_soc',
            'dateCreation'   => 'sp.datec',
            'dateValidation' => 'sp.datev',
            'statut'         => 'sp.fk_statut',
            'totalHt'        => 'sp.total_ht',
            'totalTtc'       => 'sp.total_ttc',
        ];
    }

    /**
     * Filterable API key -> {column, kind}.
     *
     * @return array<string,array{column:string,kind:string}>
     */
    private function filterMap()
    {
        return [
            'ref'          => ['column' => 'sp.ref', 'kind' => 'text'],
            'socid'        => ['column' => 'sp.fk_soc', 'kind' => 'select'],
            'statut'       => ['column' => 'sp.fk_statut', 'kind' => 'select'],
            'dateCreation' => ['column' => 'sp.datec', 'kind' => 'daterange'],
            'totalHt'      => ['column' => 'sp.total_ht', 'kind' => 'numberrange'],
        ];
    }

    /**
     * SQL columns scanned by the global LIKE search (already aliased).
     *
     * @return array<int,string>
     */
    private function searchFields()
    {
        return ['sp.ref'];
    }

    /**
     * List supplier proposals.
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "supplier_proposal as sp";
        $baseWhere = " WHERE sp.entity IN (" . getEntity('supplier_proposal') . ")";
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(sp.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK SupplierProposalController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT sp.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK SupplierProposalController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $sp = new SupplierProposal($db);
            if ($sp->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK SupplierProposalController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            // fetch() loads the lines; drop them for the list payload.
            $sp->lines = [];
            $items[] = $this->mapper->exportMappedDataFiltered($sp, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET supplierproposal/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET supplierproposal/lines/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::linesColumns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET supplierproposal/describe
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET supplierproposal/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());

        $sql = "SELECT COUNT(sp.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "supplier_proposal as sp";
        $sql .= " WHERE sp.entity IN (" . getEntity('supplier_proposal') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK SupplierProposalController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE supplierproposal (bulk)
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'supprimer')) {
            dol_syslog("DPK SupplierProposalController::deleteBulk forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK SupplierProposalController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK SupplierProposalController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }
        if (count($ids) > 100) {
            dol_syslog("DPK SupplierProposalController::deleteBulk too many ids: " . count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];
        foreach ($ids as $id) {
            $sp = new SupplierProposal($db);
            if ($sp->fetch($id) <= 0) {
                dol_syslog("DPK SupplierProposalController::deleteBulk not found id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Supplier proposal not found'];
                continue;
            }
            $resDel = $sp->delete($user);
            if ($resDel <= 0) {
                $reason = $sp->error !== '' ? $sp->error : 'Failed to delete';
                dol_syslog("DPK SupplierProposalController::deleteBulk failed id=" . $id . ": " . $reason, LOG_ERR);
                $errors[] = ['id' => $id, 'reason' => $reason];
                continue;
            }
            $success[] = $id;
        }

        return [['success' => $success, 'errors' => $errors], 200];
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
     * Legacy index handler (filters: socid, status, q).
     *
     * @param array|null $arr
     * @return array
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : 0;
        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : null;
        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';

        $sql = "SELECT sp.rowid FROM " . MAIN_DB_PREFIX . "supplier_proposal as sp";
        $sql .= " WHERE sp.entity IN (" . getEntity('supplier_proposal') . ")";
        if ($socid > 0) {
            $sql .= " AND sp.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND sp.fk_statut = " . $status;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND sp.ref LIKE '" . $like . "'";
        }
        $sql .= " ORDER BY sp.datec DESC, sp.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK SupplierProposalController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $sp = new SupplierProposal($db);
            if ($sp->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK SupplierProposalController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $sp->lines = [];
            $items[] = $this->mapper->exportMappedData($sp);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single supplier proposal with its lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'lire')) {
            dol_syslog("DPK SupplierProposalController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::show missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $data = $this->mapper->exportMappedData($sp);
        // Hydrate thirdparty (supplier) name + email for the detail summary band.
        $sp->fetch_thirdparty();
        $data->socname = ($sp->thirdparty && !empty($sp->thirdparty->name)) ? $sp->thirdparty->name : '';
        $data->socEmail = ($sp->thirdparty && !empty($sp->thirdparty->email)) ? $sp->thirdparty->email : '';

        return [$data, 200];
    }

    /**
     * Create a draft supplier proposal for a supplier.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : (isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0);
        if ($socid <= 0) {
            dol_syslog("DPK SupplierProposalController::create missing socid", LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $sp = new SupplierProposal($db);
        $sp->socid = $socid;
        $deliv = self::normalizeTimestamp($arr['delivery_date'] ?? null);
        if ($deliv !== null) {
            $sp->delivery_date = $deliv;
        }
        if (isset($arr['note_public'])) {
            $sp->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $sp->note_private = (string) $arr['note_private'];
        }
        if (!empty($arr['fk_cond_reglement'])) {
            $sp->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (!empty($arr['fk_mode_reglement'])) {
            $sp->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $sp->create($user);
        if ($result <= 0) {
            dol_syslog("DPK SupplierProposalController::create create() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to create supplier proposal: ' . $sp->error], 500];
        }

        $sp->fetch($result);
        return [$this->mapper->exportMappedData($sp), 201];
    }

    /**
     * Update header fields of a draft supplier proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::update missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        // SupplierProposal (the header class) has NO generic update() method:
        // each header field is persisted through its dedicated setter (the same
        // ones supplier_proposal/card.php uses). We apply only the provided
        // fields and surface the first failing setter.
        if (array_key_exists('note_public', $arr)) {
            if ($sp->update_note((string) $arr['note_public'], '_public') < 0) {
                dol_syslog("DPK SupplierProposalController::update update_note(public) failed: " . $sp->error, LOG_ERR);
                return [['error' => 'Failed to update public note: ' . $sp->error], 500];
            }
        }
        if (array_key_exists('note_private', $arr)) {
            if ($sp->update_note((string) $arr['note_private'], '') < 0) {
                dol_syslog("DPK SupplierProposalController::update update_note(private) failed: " . $sp->error, LOG_ERR);
                return [['error' => 'Failed to update private note: ' . $sp->error], 500];
            }
        }
        if (!empty($arr['fk_cond_reglement'])) {
            if ($sp->setPaymentTerms((int) $arr['fk_cond_reglement']) < 0) {
                dol_syslog("DPK SupplierProposalController::update setPaymentTerms failed: " . $sp->error, LOG_ERR);
                return [['error' => 'Failed to update payment terms: ' . $sp->error], 500];
            }
        }
        if (!empty($arr['fk_mode_reglement'])) {
            if ($sp->setPaymentMethods((int) $arr['fk_mode_reglement']) < 0) {
                dol_syslog("DPK SupplierProposalController::update setPaymentMethods failed: " . $sp->error, LOG_ERR);
                return [['error' => 'Failed to update payment method: ' . $sp->error], 500];
            }
        }
        if (array_key_exists('delivery_date', $arr)) {
            $deliv = self::normalizeTimestamp($arr['delivery_date']);
            if ($sp->setDeliveryDate($user, $deliv !== null ? $deliv : '') < 0) {
                dol_syslog("DPK SupplierProposalController::update setDeliveryDate failed: " . $sp->error, LOG_ERR);
                return [['error' => 'Failed to update delivery date: ' . $sp->error], 500];
            }
        }

        $sp->fetch($id);
        return [$this->mapper->exportMappedData($sp), 200];
    }

    /**
     * Delete a supplier proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'supprimer')) {
            dol_syslog("DPK SupplierProposalController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::destroy missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $result = $sp->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK SupplierProposalController::destroy delete() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to delete supplier proposal: ' . $sp->error], 500];
        }

        return [['message' => 'Supplier proposal deleted'], 200];
    }

    /**
     * Validate (draft -> validated).
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        return $this->statusAction($arr, 'validate', function ($sp, $user) {
            return $sp->valid($user);
        });
    }

    /**
     * Set a validated supplier proposal back to draft.
     *
     * @param array|null $arr
     * @return array
     */
    public function setDraft($arr = null)
    {
        return $this->statusAction($arr, 'setDraft', function ($sp, $user) {
            return $sp->setDraft($user);
        });
    }

    /**
     * Close as signed (status 2). Optional note in the body.
     *
     * @param array|null $arr
     * @return array
     */
    public function closeSigned($arr = null)
    {
        $note = isset($arr['note']) ? (string) $arr['note'] : '';
        return $this->statusAction($arr, 'closeSigned', function ($sp, $user) use ($note) {
            return $sp->cloture($user, 2, $note);
        });
    }

    /**
     * Close as not signed / refused (status 3). Optional note in the body.
     *
     * @param array|null $arr
     * @return array
     */
    public function closeUnsigned($arr = null)
    {
        $note = isset($arr['note']) ? (string) $arr['note'] : '';
        return $this->statusAction($arr, 'closeUnsigned', function ($sp, $user) use ($note) {
            return $sp->cloture($user, 3, $note);
        });
    }

    /**
     * Reopen a closed supplier proposal back to validated (status 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function reopen($arr = null)
    {
        return $this->statusAction($arr, 'reopen', function ($sp, $user) {
            return $sp->reopen($user, 1, '');
        });
    }

    /**
     * Shared status-transition runner (fetch + permission + action + re-export).
     *
     * @param array|null $arr
     * @param string     $label
     * @param callable   $action  fn($sp, $user): int  (>0 = OK)
     * @return array
     */
    private function statusAction($arr, $label, callable $action)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::{$label} forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::{$label} missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::{$label} not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $result = $action($sp, $user);
        if ($result <= 0) {
            $reason = $sp->error !== '' ? $sp->error : ('action ' . $label . ' failed');
            dol_syslog("DPK SupplierProposalController::{$label} failed: " . $reason, LOG_ERR);
            return [['error' => 'Action failed: ' . $reason], 500];
        }

        $sp->fetch($id);
        return [$this->mapper->exportMappedData($sp), 200];
    }

    /**
     * Duplicate a supplier proposal (createFromClone). Returns the new draft.
     *
     * @param array|null $arr
     * @return array
     */
    public function cloneDocument($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::cloneDocument forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::cloneDocument missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::cloneDocument not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $newId = $sp->createFromClone($user);
        if ($newId <= 0) {
            dol_syslog("DPK SupplierProposalController::cloneDocument createFromClone() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to clone supplier proposal: ' . $sp->error], 500];
        }

        $clone = new SupplierProposal($db);
        $clone->fetch($newId);
        return [$this->mapper->exportMappedData($clone), 201];
    }

    /** Wiring for the shared DocumentLinkTrait. */
    private function linkConfig()
    {
        return [
            'class'         => '\\SupplierProposal',
            'permGroup'     => 'supplier_proposal',
            'logTag'        => 'SupplierProposalController',
            'notFoundLabel' => 'Supplier proposal',
        ];
    }

    /** GET supplierproposal/{id}/links */
    public function links($arr = null)
    {
        return $this->listLinks($arr, $this->linkConfig());
    }

    /** DELETE supplierproposal/{id}/link/{rowid} */
    public function linkRemove($arr = null)
    {
        return $this->removeLink($arr, $this->linkConfig());
    }

    /**
     * Add a line to a supplier proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::addLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK SupplierProposalController::addLine missing id", LOG_WARNING);
            return [['error' => 'Supplier proposal id is required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::addLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
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
        $special_code = isset($arr['special_code']) ? (int) $arr['special_code'] : 0;
        $ref_supplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : '';
        $fk_unit = isset($arr['fk_unit']) && (int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : '';

        // Hydrate from product when a product is picked but fields are missing,
        // mirroring the customer order/proposal addline behaviour.
        if ($fk_product > 0) {
            $product = new \Product($db);
            if ($product->fetch($fk_product) > 0) {
                if ($desc === '') {
                    $desc = (string) ($product->description !== '' ? $product->description : $product->label);
                }
                if ($label === '') {
                    $label = (string) $product->label;
                }
                if (!isset($arr['subprice'])) {
                    // Default to the product sell price; the user adjusts it to
                    // the requested supplier price on the line.
                    $pu_ht = (float) $product->price;
                }
                if (!isset($arr['tva_tx']) && $product->tva_tx !== null) {
                    $txtva = (string) $product->tva_tx;
                }
                if (!isset($arr['product_type'])) {
                    $product_type = (int) $product->type;
                }
                if ($fk_unit === '' && !empty($product->fk_unit)) {
                    $fk_unit = (int) $product->fk_unit;
                }
            }
        }

        // SupplierProposal::addline (26 args):
        //   1 desc, 2 pu_ht, 3 qty, 4 txtva, 5 txlocaltax1, 6 txlocaltax2,
        //   7 fk_product, 8 remise_percent, 9 price_base_type, 10 pu_ttc,
        //  11 info_bits, 12 type, 13 rang, 14 special_code, 15 fk_parent_line,
        //  16 fk_fournprice, 17 pa_ht, 18 label, 19 array_options,
        //  20 ref_supplier, 21 fk_unit, 22 origin, 23 origin_id,
        //  24 pu_ht_devise, 25 date_start, 26 date_end
        $result = $sp->addline(
            $desc,
            $pu_ht,
            $qty,
            $txtva,
            0,
            0,
            $fk_product,
            $remise_percent,
            'HT',
            0,
            0,
            $product_type,
            $rang,
            $special_code,
            0,
            0,
            0,
            $label,
            0,
            $ref_supplier,
            $fk_unit
        );
        if ($result <= 0) {
            dol_syslog("DPK SupplierProposalController::addLine addline() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to add line: ' . $sp->error], 500];
        }

        $sp->fetch($id);
        return [$this->mapper->exportMappedData($sp), 201];
    }

    /**
     * Update a line of a supplier proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function updateLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::updateLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK SupplierProposalController::updateLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Supplier proposal id and line id are required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::updateLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $existing = null;
        foreach ($sp->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog("DPK SupplierProposalController::updateLine line not found lineid=" . $lineid, LOG_WARNING);
            return [['error' => 'Line not found'], 404];
        }

        $pu = isset($arr['subprice']) ? (float) $arr['subprice'] : (float) $existing->subprice;
        $qty = isset($arr['qty']) ? (float) $arr['qty'] : (float) $existing->qty;
        $remise_percent = isset($arr['remise_percent']) ? (float) $arr['remise_percent'] : (float) $existing->remise_percent;
        $txtva = isset($arr['tva_tx']) ? (string) $arr['tva_tx'] : (string) $existing->tva_tx;
        $desc = isset($arr['description']) ? (string) $arr['description'] : (string) $existing->desc;
        $label = isset($arr['label']) ? (string) $arr['label'] : (string) ($existing->label ?? '');
        $type = isset($arr['product_type']) ? (int) $arr['product_type'] : (int) $existing->product_type;
        $special_code = isset($arr['special_code']) ? (int) $arr['special_code'] : (int) ($existing->special_code ?? 0);
        $ref_supplier = isset($arr['ref_supplier']) ? (string) $arr['ref_supplier'] : (string) ($existing->ref_fourn ?? '');
        $fk_unit = isset($arr['fk_unit']) ? ((int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : '') : (isset($existing->fk_unit) ? (int) $existing->fk_unit : '');

        // SupplierProposal::updateline (21 args):
        //   1 rowid, 2 pu, 3 qty, 4 remise_percent, 5 txtva, 6 txlocaltax1,
        //   7 txlocaltax2, 8 desc, 9 price_base_type, 10 info_bits,
        //  11 special_code, 12 fk_parent_line, 13 skip_update_total,
        //  14 fk_fournprice, 15 pa_ht, 16 label, 17 type, 18 array_options,
        //  19 ref_supplier, 20 fk_unit, 21 pu_ht_devise
        $result = $sp->updateline(
            $lineid,
            $pu,
            $qty,
            $remise_percent,
            $txtva,
            0,
            0,
            $desc,
            'HT',
            0,
            $special_code,
            0,
            0,
            0,
            0,
            $label,
            $type,
            0,
            $ref_supplier,
            $fk_unit
        );
        if ($result <= 0) {
            dol_syslog("DPK SupplierProposalController::updateLine updateline() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to update line: ' . $sp->error], 500];
        }

        $sp->fetch($id);
        return [$this->mapper->exportMappedData($sp), 200];
    }

    /**
     * Delete a line from a supplier proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('supplier_proposal', 'creer')) {
            dol_syslog("DPK SupplierProposalController::deleteLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK SupplierProposalController::deleteLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Supplier proposal id and line id are required'], 400];
        }

        $sp = new SupplierProposal($db);
        if ($sp->fetch($id) <= 0) {
            dol_syslog("DPK SupplierProposalController::deleteLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Supplier proposal not found'], 404];
        }

        $result = $sp->deleteline($lineid);
        if ($result <= 0) {
            dol_syslog("DPK SupplierProposalController::deleteLine deleteline() failed: " . $sp->error, LOG_ERR);
            return [['error' => 'Failed to delete line: ' . $sp->error], 500];
        }

        $sp->fetch($id);
        return [$this->mapper->exportMappedData($sp), 200];
    }
}
