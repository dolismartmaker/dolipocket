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

dol_include_once('/commande/class/commande.class.php');
dol_include_once('/comm/propal/class/propal.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/SendEmailTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PdfDownloadTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmOrder.php');

use Commande;
use Propal;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\SendEmailTrait;
use Dolipocket\Api\Trait\PdfDownloadTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * Customer order (commande client) API controller.
 *
 * Routes:
 *   GET    order                                 -> index
 *   GET    order/columns                         -> columns
 *   GET    order/count                           -> count
 *   GET    order/{id}                            -> show
 *   POST   order                                 -> create
 *   PUT    order/{id}                            -> update
 *   DELETE order                                 -> deleteBulk
 *   DELETE order/{id}                            -> destroy
 *   POST   order/{id}/validate                   -> validate
 *   POST   order/createfromproposal/{proposalid} -> createFromProposal
 *   POST   order/{id}/line                       -> addLine
 *   PUT    order/{id}/line/{lineid}              -> updateLine
 *   DELETE order/{id}/line/{lineid}              -> deleteLine
 */
class OrderController
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
     * @var dmOrder Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmOrder();
    }

    /**
     * List orders.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (filters: socid, status, q).
     *   - Paginated envelope when at least one of search/filter/sort/page/limit
     *     is provided.
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "commande as c";
        $baseWhere = " WHERE c.entity IN (" . getEntity('commande') . ")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'c');
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(c.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK OrderController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'c', self::$defaultSort);
        $sql = "SELECT c.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK OrderController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $cmd = new Commande($db);
            if ($cmd->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK OrderController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedDataFiltered($cmd, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET order/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET order/lines/columns
     *
     * Returns the catalog describing the order-line columns. Cf
     * docs/DATATABLE_SPEC.md section 13.
     *
     * @param array|null $arr
     * @return array
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::linesColumns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET order/describe
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

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET order/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'c');

        $sql = "SELECT COUNT(c.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "commande as c";
        $sql .= " WHERE c.entity IN (" . getEntity('commande') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK OrderController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE order (bulk)
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'supprimer')) {
            dol_syslog("DPK OrderController::deleteBulk forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK OrderController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK OrderController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK OrderController::deleteBulk too many ids: " . count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $cmd = new Commande($db);
            $res = $cmd->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK OrderController::deleteBulk order not found id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Order not found'];
                continue;
            }

            $resDel = $cmd->delete($user);
            if ($resDel <= 0) {
                $reason = $cmd->error !== '' ? $cmd->error : 'Failed to delete';
                dol_syslog("DPK OrderController::deleteBulk failed id=" . $id . ": " . $reason, LOG_ERR);
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

        $sql = "SELECT c.rowid FROM " . MAIN_DB_PREFIX . "commande as c";
        $sql .= " WHERE c.entity IN (" . getEntity('commande') . ")";
        if ($socid > 0) {
            $sql .= " AND c.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND c.fk_statut = " . $status;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND (c.ref LIKE '" . $like . "' OR c.ref_client LIKE '" . $like . "')";
        }
        $sql .= " ORDER BY c.date_commande DESC, c.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK OrderController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $cmd = new Commande($db);
            if ($cmd->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK OrderController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedData($cmd);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single order with its lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::show missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }
        $cmd->fetch_lines();

        return [$this->mapper->exportMappedData($cmd), 200];
    }

    /**
     * Create a draft order for a thirdparty.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : (isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0);
        if ($socid <= 0) {
            dol_syslog("DPK OrderController::create missing socid", LOG_WARNING);
            return [['error' => 'socid is required'], 400];
        }

        $cmd = new Commande($db);
        $cmd->socid = $socid;
        $dateCmd = self::normalizeTimestamp($arr['date_commande'] ?? null);
        $cmd->date_commande = $dateCmd !== null ? $dateCmd : dol_now();
        $delivCreate = self::normalizeTimestamp($arr['date_livraison'] ?? null);
        if ($delivCreate !== null) {
            $cmd->delivery_date = $delivCreate;
        }
        if (isset($arr['ref_client'])) {
            $cmd->ref_client = $arr['ref_client'];
        }
        if (isset($arr['note_public'])) {
            $cmd->note_public = $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $cmd->note_private = $arr['note_private'];
        }
        if (!empty($arr['fk_cond_reglement'])) {
            $cmd->cond_reglement_id = (int) $arr['fk_cond_reglement'];
        }
        if (!empty($arr['fk_mode_reglement'])) {
            $cmd->mode_reglement_id = (int) $arr['fk_mode_reglement'];
        }

        $result = $cmd->create($user);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::create create() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to create order: ' . $cmd->error], 500];
        }

        $cmd->fetch($result);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 201];
    }

    /**
     * Update header fields of a draft order.
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::update missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }

        $payload = $arr;
        unset($payload['id']);

        // Pre-process date fields with the project-specific normalizer
        // (accepts JS Date.now() milliseconds, cf PaginatedListTrait).
        foreach (['date_commande', 'date_livraison'] as $dateField) {
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
            dol_syslog("DPK OrderController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk Dolibarr: on Commande, fk_cond_reglement / fk_mode_reglement
            // are stored on cond_reglement_id / mode_reglement_id PHP properties.
            if ($field === 'fk_cond_reglement') {
                $cmd->cond_reglement_id = $value;
                continue;
            }
            if ($field === 'fk_mode_reglement') {
                $cmd->mode_reglement_id = $value;
                continue;
            }
            // Quirk Dolibarr: API field date_livraison maps to PHP property
            // $delivery_date. The SQL column is still `date_livraison`.
            // Commande::update() reads $this->delivery_date for the write.
            if ($field === 'date_livraison') {
                $cmd->delivery_date = $value;
                continue;
            }
            $cmd->$field = $value;
        }

        $result = $cmd->update($user);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::update update() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to update order: ' . $cmd->error], 500];
        }

        $cmd->fetch($id);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 200];
    }

    /**
     * Delete an order.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'supprimer')) {
            dol_syslog("DPK OrderController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::destroy missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }

        $result = $cmd->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::destroy delete() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to delete order: ' . $cmd->error], 500];
        }

        return [['message' => 'Order deleted'], 200];
    }

    /**
     * Validate (move from draft to validated) an order.
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::validate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::validate missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::validate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }

        $result = $cmd->valid($user);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::validate valid() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to validate order: ' . $cmd->error], 500];
        }

        $cmd->fetch($id);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 200];
    }

    /**
     * Create an order from an existing proposal (devis -> commande).
     *
     * @param array|null $arr
     * @return array
     */
    public function createFromProposal($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::createFromProposal forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $proposalid = isset($arr['proposalid']) ? (int) $arr['proposalid'] : 0;
        if ($proposalid <= 0) {
            dol_syslog("DPK OrderController::createFromProposal missing proposalid", LOG_WARNING);
            return [['error' => 'Proposal id is required'], 400];
        }

        $propal = new Propal($db);
        if ($propal->fetch($proposalid) <= 0) {
            dol_syslog("DPK OrderController::createFromProposal proposal not found id=" . $proposalid, LOG_WARNING);
            return [['error' => 'Proposal not found'], 404];
        }
        $propal->fetch_lines();

        $cmd = new Commande($db);
        $result = $cmd->createFromProposal($propal, $user);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::createFromProposal createFromProposal() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to create order from proposal: ' . $cmd->error], 500];
        }

        $cmd->fetch($result);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 201];
    }

    /**
     * Add a line to an order.
     *
     * @param array|null $arr
     * @return array
     */
    public function addLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::addLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::addLine missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::addLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
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

        // Commande::addline signature (28 args):
        //   1 desc, 2 pu_ht, 3 qty, 4 txtva, 5 txlocaltax1,
        //   6 txlocaltax2, 7 fk_product, 8 remise_percent, 9 info_bits,
        //  10 fk_remise_except, 11 price_base_type, 12 pu_ttc,
        //  13 date_start, 14 date_end, 15 type, 16 rang,
        //  17 special_code, 18 fk_parent_line, 19 fk_fournprice,
        //  20 pa_ht, 21 label, 22 array_options, 23 fk_unit,
        //  24 origin, 25 origin_id, 26 pu_ht_devise, 27 ref_ext,
        //  28 noupdateafterinsertline
        $result = $cmd->addline(
            $desc,
            $pu_ht,
            $qty,
            $txtva,
            0,
            0,
            $fk_product,
            $remise_percent,
            0,
            0,
            'HT',
            0,
            $dateStart,
            $dateEnd,
            $product_type,
            $rang,
            $special_code,
            0,
            null,
            0,
            $label,
            0,
            $fk_unit
        );
        if ($result <= 0) {
            dol_syslog("DPK OrderController::addLine addline() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to add line: ' . $cmd->error], 500];
        }

        $cmd->fetch($id);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 201];
    }

    /**
     * Update a line of an order.
     *
     * @param array|null $arr
     * @return array
     */
    public function updateLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::updateLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK OrderController::updateLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Order id and line id are required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::updateLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }
        $cmd->fetch_lines();

        $existing = null;
        foreach ($cmd->lines as $line) {
            if ((int) $line->id === $lineid) {
                $existing = $line;
                break;
            }
        }
        if ($existing === null) {
            dol_syslog("DPK OrderController::updateLine line not found lineid=" . $lineid, LOG_WARNING);
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
        // dates / null for fk_unit which Commande::updateline interprets as
        // "no change").
        $dateStart = array_key_exists('date_start', $arr) ? self::normalizeTimestamp($arr['date_start']) : (int) ($existing->date_start ?? 0);
        $dateEnd = array_key_exists('date_end', $arr) ? self::normalizeTimestamp($arr['date_end']) : (int) ($existing->date_end ?? 0);
        if ($dateStart === null) $dateStart = '';
        if ($dateEnd === null) $dateEnd = '';
        $fk_unit = array_key_exists('fk_unit', $arr)
            ? ((int) $arr['fk_unit'] > 0 ? (int) $arr['fk_unit'] : null)
            : (isset($existing->fk_unit) ? (int) $existing->fk_unit : null);

        // Commande::updateline signature (25 args):
        //   1 rowid, 2 desc, 3 pu, 4 qty, 5 remise_percent,
        //   6 txtva, 7 txlocaltax1, 8 txlocaltax2, 9 price_base_type,
        //  10 info_bits, 11 date_start, 12 date_end, 13 type,
        //  14 fk_parent_line, 15 skip_update_total, 16 fk_fournprice,
        //  17 pa_ht, 18 label, 19 special_code, 20 array_options,
        //  21 fk_unit, 22 pu_ht_devise, 23 notrigger, 24 ref_ext,
        //  25 rang
        $result = $cmd->updateline(
            $lineid,
            $desc,
            $pu,
            $qty,
            $remise_percent,
            $txtva,
            0.0,
            0.0,
            'HT',
            0,
            $dateStart,
            $dateEnd,
            $type,
            0,
            0,
            null,
            0,
            $label,
            $special_code,
            0,
            $fk_unit,
            0,
            0,
            '',
            $rang
        );
        if ($result <= 0) {
            dol_syslog("DPK OrderController::updateLine updateline() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to update line: ' . $cmd->error], 500];
        }

        $cmd->fetch($id);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 200];
    }

    /**
     * Delete a line from an order.
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('commande', 'creer')) {
            dol_syslog("DPK OrderController::deleteLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK OrderController::deleteLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Order id and line id are required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::deleteLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }

        $result = $cmd->deleteline($user, $lineid, $id);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::deleteLine deleteline() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to delete line: ' . $cmd->error], 500];
        }

        $cmd->fetch($id);
        $cmd->fetch_lines();
        return [$this->mapper->exportMappedData($cmd), 200];
    }

    /**
     * POST order/{id}/pdf
     *
     * Generate the PDF document for the order using the configured
     * model (Dolibarr conf $conf->global->COMMANDE_ADDON_PDF, falls back to
     * 'einstein'). Mirrors what the Dolibarr standard "(Re)generate" button
     * does on the order card.
     *
     * Body params:
     *   - model    (optional) -- override the PDF model name
     *   - lang     (optional) -- output language
     *   - hideref  / hidedesc / hidedetails (optional bool)
     *
     * Returns { ok, file } where `file` is the basename of the generated
     * PDF (saved under documents/<entity>/commande/<ref>/).
     *
     * @param array|null $arr
     * @return array
     */
    public function generatePdf($arr = null)
    {
        global $db, $user, $langs, $conf;

        if (!$user->hasRight('commande', 'creer') && !$user->hasRight('commande', 'lire')) {
            dol_syslog("DPK OrderController::generatePdf forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK OrderController::generatePdf missing id", LOG_WARNING);
            return [['error' => 'Order id is required'], 400];
        }

        $cmd = new Commande($db);
        if ($cmd->fetch($id) <= 0) {
            dol_syslog("DPK OrderController::generatePdf not found id=" . $id, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }
        $cmd->fetch_lines();
        $cmd->fetch_thirdparty();

        $model = isset($arr['model']) && trim((string) $arr['model']) !== ''
            ? (string) $arr['model']
            : (string) (getDolGlobalString('COMMANDE_ADDON_PDF') ?: 'einstein');
        $hideref = isset($arr['hideref']) ? (int) $arr['hideref'] : 0;
        $hidedesc = isset($arr['hidedesc']) ? (int) $arr['hidedesc'] : 0;
        $hidedetails = isset($arr['hidedetails']) ? (int) $arr['hidedetails'] : 0;

        $result = $cmd->generateDocument($model, $langs, $hidedetails, $hidedesc, $hideref);
        if ($result <= 0) {
            dol_syslog("DPK OrderController::generatePdf generateDocument() failed: " . $cmd->error, LOG_ERR);
            return [['error' => 'Failed to generate PDF: ' . $cmd->error], 500];
        }

        return [
            ['ok' => true, 'file' => $cmd->last_main_doc ?? '', 'model' => $model],
            200,
        ];
    }

    /**
     * POST order/{id}/send
     *
     * Send the customer order by email with the last generated PDF attached.
     * Cf .claude/CLAUDE.md "Envoi par email" (todo.md task 1).
     *
     * @param array|null $arr
     * @return array
     */
    public function send($arr = null)
    {
        return $this->sendEmail($arr, [
            'objectClass'   => '\\Commande',
            'permGroup'     => 'commande',
            'logTag'        => 'OrderController',
            'notFoundLabel' => 'Order',
            'defaultModel'  => 'einstein',
            'addonPdfKey'   => 'COMMANDE_ADDON_PDF',
            'subjectPrefix' => 'Commande',
        ]);
    }

    /**
     * GET order/{id}/pdf/download
     *
     * Stream the last generated PDF for the customer order. Reads
     * $obj->last_main_doc; does NOT regenerate. Cf todo.md task 3.
     *
     * @param array|null $arr
     * @return array
     */
    public function download($arr = null)
    {
        return $this->downloadPdf($arr, [
            'objectClass'   => '\\Commande',
            'permGroup'     => 'commande',
            'logTag'        => 'OrderController',
            'notFoundLabel' => 'Order',
        ]);
    }
}
