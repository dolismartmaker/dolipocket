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

require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmProposal.php');

use Propal;
use Dolipocket\Api\Trait\PaginatedListTrait;

/**
 * Customer proposal (devis) API controller.
 *
 * Routes (handled in pwa/api.php):
 *   GET    proposal                              -> index
 *   GET    proposal/columns                      -> columns
 *   GET    proposal/count                        -> count
 *   GET    proposal/{id}                         -> show
 *   POST   proposal                              -> create
 *   PUT    proposal/{id}                         -> update
 *   DELETE proposal                              -> deleteBulk
 *   DELETE proposal/{id}                         -> destroy
 *   POST   proposal/{id}/validate                -> validate
 *   POST   proposal/{id}/closesign               -> closeSigned
 *   POST   proposal/{id}/closeunsign             -> closeUnsigned
 *   POST   proposal/{id}/line                    -> addLine
 *   PUT    proposal/{id}/line/{lineid}           -> updateLine
 *   DELETE proposal/{id}/line/{lineid}           -> deleteLine
 */
class ProposalController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'p.datep DESC, p.rowid DESC';

    /**
     * @var dmProposal Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmProposal();
    }

    /**
     * List proposals.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array with the historical 'socid', 'status', 'q' params.
     *   - Paginated envelope when at least one of search/filter/sort/page/limit
     *     is provided.
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'lire')) {
            dol_syslog("DPK ProposalController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "propal as p";
        $baseWhere = " WHERE p.entity IN (" . getEntity('propal') . ")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'p');
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(p.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ProposalController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'p', self::$defaultSort);
        $sql = "SELECT p.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProposalController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $propal = new Propal($db);
            if ($propal->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ProposalController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedDataFiltered($propal, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET proposal/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('propal', 'lire')) {
            dol_syslog("DPK ProposalController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET proposal/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'lire')) {
            dol_syslog("DPK ProposalController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'p');

        $sql = "SELECT COUNT(p.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "propal as p";
        $sql .= " WHERE p.entity IN (" . getEntity('propal') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProposalController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE proposal (bulk)
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'supprimer')) {
            dol_syslog("DPK ProposalController::deleteBulk forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK ProposalController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK ProposalController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK ProposalController::deleteBulk too many ids: " . count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $propal = new Propal($db);
            $res = $propal->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK ProposalController::deleteBulk proposal not found id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Proposal not found'];
                continue;
            }

            $resDel = $propal->delete($user);
            if ($resDel <= 0) {
                $reason = $propal->error !== '' ? $propal->error : 'Failed to delete';
                dol_syslog("DPK ProposalController::deleteBulk failed id=" . $id . ": " . $reason, LOG_ERR);
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

        $sql = "SELECT p.rowid FROM " . MAIN_DB_PREFIX . "propal as p";
        $sql .= " WHERE p.entity IN (" . getEntity('propal') . ")";
        if ($socid > 0) {
            $sql .= " AND p.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND p.fk_statut = " . $status;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND (p.ref LIKE '" . $like . "' OR p.ref_client LIKE '" . $like . "')";
        }
        $sql .= " ORDER BY p.datep DESC, p.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProposalController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $propal = new Propal($db);
            if ($propal->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ProposalController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedData($propal);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single proposal with its lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'lire')) {
            dol_syslog("DPK ProposalController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::show missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }
        $propal->fetch_lines();

        return [$this->mapper->exportMappedData($propal), 200];
    }

    /**
     * Create a draft proposal for a thirdparty.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : (isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0);
        if ($socid <= 0) {
            dol_syslog("DPK ProposalController::create missing socid", LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $propal = new Propal($db);
        $propal->socid = $socid;
        $propal->date = !empty($arr['datep']) ? (is_numeric($arr['datep']) ? (int) $arr['datep'] : strtotime($arr['datep'])) : dol_now();
        $propal->datep = $propal->date;
        if (!empty($arr['fin_validite'])) {
            $propal->fin_validite = is_numeric($arr['fin_validite']) ? (int) $arr['fin_validite'] : strtotime($arr['fin_validite']);
        }
        if (isset($arr['ref_client'])) {
            $propal->ref_client = $arr['ref_client'];
        }
        if (isset($arr['note_public'])) {
            $propal->note_public = $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $propal->note_private = $arr['note_private'];
        }
        if (!empty($arr['fk_cond_reglement'])) {
            $propal->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (!empty($arr['fk_mode_reglement'])) {
            $propal->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $propal->create($user);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::create create() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to create proposal: ' . $propal->error], 500];
        }

        $propal->fetch($result);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 201];
    }

    /**
     * Update header fields of a draft proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::update missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }

        if (isset($arr['ref_client'])) {
            $propal->ref_client = $arr['ref_client'];
        }
        if (isset($arr['datep'])) {
            $propal->date = is_numeric($arr['datep']) ? (int) $arr['datep'] : strtotime($arr['datep']);
            $propal->datep = $propal->date;
        }
        if (isset($arr['fin_validite'])) {
            $propal->fin_validite = is_numeric($arr['fin_validite']) ? (int) $arr['fin_validite'] : strtotime($arr['fin_validite']);
        }
        if (isset($arr['note_public'])) {
            $propal->note_public = $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $propal->note_private = $arr['note_private'];
        }
        if (isset($arr['fk_cond_reglement'])) {
            $propal->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (isset($arr['fk_mode_reglement'])) {
            $propal->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $propal->update($user);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::update update() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to update proposal: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 200];
    }

    /**
     * Delete a proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'supprimer')) {
            dol_syslog("DPK ProposalController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::destroy missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }

        $result = $propal->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::destroy delete() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to delete proposal: ' . $propal->error], 500];
        }

        return [['message' => 'Proposal deleted'], 200];
    }

    /**
     * Validate (move from draft to validated) a proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::validate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::validate missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::validate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }

        $result = $propal->valid($user);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::validate valid() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to validate proposal: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 200];
    }

    /**
     * Close proposal as signed (status 2).
     *
     * @param array|null $arr
     * @return array
     */
    public function closeSigned($arr = null)
    {
        return $this->closeWithStatus($arr, Propal::STATUS_SIGNED, 'closeSigned');
    }

    /**
     * Close proposal as not signed / refused (status 3).
     *
     * @param array|null $arr
     * @return array
     */
    public function closeUnsigned($arr = null)
    {
        return $this->closeWithStatus($arr, Propal::STATUS_NOTSIGNED, 'closeUnsigned');
    }

    /**
     * Shared helper for closing a proposal with a target status.
     *
     * @param array|null $arr
     * @param int $status
     * @param string $methodName
     * @return array
     */
    private function closeWithStatus($arr, $status, $methodName)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::" . $methodName . " forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::" . $methodName . " missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::" . $methodName . " not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }

        $note = isset($arr['note']) ? (string) $arr['note'] : '';
        $result = $propal->closeProposal($user, $status, $note);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::" . $methodName . " closeProposal() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to close proposal: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 200];
    }

    /**
     * Add a line to a proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::addLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProposalController::addLine missing id", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::addLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
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

        $result = $propal->addline(
            $desc,
            $pu_ht,
            $qty,
            $txtva,
            0.0,
            0.0,
            $fk_product,
            $remise_percent,
            'HT',
            0.0,
            0,
            $product_type,
            $rang,
            0,
            0,
            0,
            0,
            $label
        );
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::addLine addline() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to add line: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 201];
    }

    /**
     * Update a line of a proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function updateLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::updateLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK ProposalController::updateLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Proposal id and line id are required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::updateLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }
        $propal->fetch_lines();

        // Find the existing line to merge unchanged values
        $existing = null;
        foreach ($propal->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog("DPK ProposalController::updateLine line not found lineid=" . $lineid, LOG_WARNING);
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

        $result = $propal->updateline(
            $lineid,
            $pu,
            $qty,
            $remise_percent,
            $txtva,
            0.0,
            0.0,
            $desc,
            'HT',
            0,
            0,
            0,
            0,
            0,
            0,
            $label,
            $type,
            '',
            '',
            0,
            null,
            0,
            0,
            $rang
        );
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::updateLine updateline() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to update line: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 200];
    }

    /**
     * Delete a line from a proposal.
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('propal', 'creer')) {
            dol_syslog("DPK ProposalController::deleteLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK ProposalController::deleteLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Proposal id and line id are required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($id) <= 0) {
            dol_syslog("DPK ProposalController::deleteLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }

        $result = $propal->deleteline($lineid, $id);
        if ($result <= 0) {
            dol_syslog("DPK ProposalController::deleteLine deleteline() failed: " . $propal->error, LOG_ERR);
            return [['error' => 'Failed to delete line: ' . $propal->error], 500];
        }

        $propal->fetch($id);
        $propal->fetch_lines();
        return [$this->mapper->exportMappedData($propal), 200];
    }
}
