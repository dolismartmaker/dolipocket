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

dol_include_once('/expedition/class/expedition.class.php');
dol_include_once('/commande/class/commande.class.php');
dol_include_once('/product/class/product.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/DocumentLinkTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmShipment.php');

use Expedition;
use Commande;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\DocumentLinkTrait;

/**
 * Customer shipment (Expedition) API controller -- Tier A lot A1.
 *
 * A shipment is created FROM a validated customer order: the body carries the
 * origin order id plus the lines to ship ({entrepot_id, fk_origin_line, qty}).
 * Stock is decremented by Dolibarr at validate() (STOCK_CALCULATE_ON_SHIPMENT)
 * or at close() (STOCK_CALCULATE_ON_SHIPMENT_CLOSE) -- this controller never
 * moves stock itself, it only drives the native Expedition methods so the
 * behaviour matches expedition/card.php exactly.
 *
 * Routes (singular, cf .claude/CLAUDE.md naming convention):
 *   GET    shipment                       -> index   (paginated + legacy)
 *   GET    shipment/columns               -> columns
 *   GET    shipment/lines/columns         -> linesColumns
 *   GET    shipment/describe              -> describe
 *   GET    shipment/count                 -> count
 *   GET    shipment/{id}                  -> show
 *   POST   shipment                       -> create  (from order)
 *   PUT    shipment/{id}                  -> update
 *   DELETE shipment/{id}                  -> destroy
 *   POST   shipment/{id}/validate         -> validate
 *   POST   shipment/{id}/close            -> closeShipment
 *   POST   shipment/{id}/reopen           -> reopen
 *   POST   shipment/{id}/setdraft         -> setDraft
 *   POST   shipment/{id}/cancel           -> cancel
 *   DELETE shipment/{id}/line/{lineid}    -> deleteLine
 *   GET    shipment/{id}/links            -> links
 *   DELETE shipment/{id}/link/{rowid}     -> linkRemove
 */
class ShipmentController
{
    use PaginatedListTrait;
    use DocumentLinkTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'e.date_expedition DESC, e.rowid DESC';

    /**
     * @var dmShipment Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmShipment();
    }

    /**
     * Whitelist of sortable API keys -> real SQL columns (aliased on "e").
     *
     * We cannot use the catalog-driven sort here: several mapper "doliside"
     * keys are PHP property names (statut, shipping_method_id, trueWeight,
     * fk_delivery_address) that differ from the llx_expedition column names
     * (fk_statut, fk_shipping_method, weight, fk_address). Driving SQL from the
     * catalog would emit "e.statut" and crash. This explicit map maps the
     * camelCase API keys produced by the mapper to the actual columns.
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return [
            'ref'            => 'e.ref',
            'refCustomer'    => 'e.ref_customer',
            'socid'          => 'e.fk_soc',
            'dateExpedition' => 'e.date_expedition',
            'dateDelivery'   => 'e.date_delivery',
            'dateCreation'   => 'e.date_creation',
            'dateValid'      => 'e.date_valid',
            'statut'         => 'e.fk_statut',
            'billed'         => 'e.billed',
            'trackingNumber' => 'e.tracking_number',
            'weight'         => 'e.weight',
        ];
    }

    /**
     * Whitelist of filterable API keys -> {column, kind}.
     *
     * @return array<string,array{column:string,kind:string}>
     */
    private function filterMap()
    {
        return [
            'ref'            => ['column' => 'e.ref', 'kind' => 'text'],
            'refCustomer'    => ['column' => 'e.ref_customer', 'kind' => 'text'],
            'trackingNumber' => ['column' => 'e.tracking_number', 'kind' => 'text'],
            'socid'          => ['column' => 'e.fk_soc', 'kind' => 'select'],
            'statut'         => ['column' => 'e.fk_statut', 'kind' => 'select'],
            'billed'         => ['column' => 'e.billed', 'kind' => 'boolean'],
            'dateExpedition' => ['column' => 'e.date_expedition', 'kind' => 'daterange'],
            'dateDelivery'   => ['column' => 'e.date_delivery', 'kind' => 'daterange'],
        ];
    }

    /**
     * SQL columns scanned by the global LIKE search (already aliased).
     *
     * @return array<int,string>
     */
    private function searchFields()
    {
        return ['e.ref', 'e.ref_customer', 'e.tracking_number'];
    }

    /**
     * List shipments. Paginated envelope when a list param is present,
     * legacy raw array otherwise (filters: socid, status, q).
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "expedition as e";
        $baseWhere = " WHERE e.entity IN (" . getEntity('expedition') . ")";
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(e.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ShipmentController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT e.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ShipmentController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $exp = new Expedition($db);
            if ($exp->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ShipmentController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            // fetch() forces fetch_lines(); drop the heavy lines block for the
            // list (totals stay on the $exp->total_* properties).
            $exp->lines = [];
            $items[] = $this->mapper->exportMappedDataFiltered($exp, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET shipment/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET shipment/lines/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::linesColumns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET shipment/describe
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET shipment/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());

        $sql = "SELECT COUNT(e.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "expedition as e";
        $sql .= " WHERE e.entity IN (" . getEntity('expedition') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ShipmentController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
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

        $sql = "SELECT e.rowid FROM " . MAIN_DB_PREFIX . "expedition as e";
        $sql .= " WHERE e.entity IN (" . getEntity('expedition') . ")";
        if ($socid > 0) {
            $sql .= " AND e.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND e.fk_statut = " . $status;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND (e.ref LIKE '" . $like . "' OR e.tracking_number LIKE '" . $like . "')";
        }
        $sql .= " ORDER BY e.date_expedition DESC, e.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ShipmentController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $exp = new Expedition($db);
            if ($exp->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ShipmentController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $exp->lines = [];
            $items[] = $this->mapper->exportMappedData($exp);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single shipment with its grouped lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'lire')) {
            dol_syslog("DPK ShipmentController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::show missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Create a shipment from a (validated) customer order.
     *
     * Body:
     *   - origin_id          (int, required)  source order id
     *   - lines              (array, required) each {entrepot_id, fk_origin_line, qty}
     *   - date_delivery      (optional) planned delivery date (s or ms)
     *   - tracking_number    (optional)
     *   - shipping_method_id (optional)
     *   - ref_customer       (optional)
     *   - note_public / note_private (optional)
     *
     * Mirrors expedition/card.php: set origin = 'commande' + origin_id, addline()
     * for each shippable order line, then create(). Stock is moved later, at
     * validate()/close(), by Dolibarr -- not here.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $orderId = isset($arr['origin_id']) ? (int) $arr['origin_id'] : 0;
        if ($orderId <= 0) {
            dol_syslog("DPK ShipmentController::create missing origin_id (order)", LOG_WARNING);
            return [['error' => 'origin_id (order id) is required'], 400];
        }

        $rawLines = (is_array($arr) && isset($arr['lines']) && is_array($arr['lines'])) ? $arr['lines'] : null;
        if ($rawLines === null || empty($rawLines)) {
            dol_syslog("DPK ShipmentController::create missing or empty 'lines'", LOG_WARNING);
            return [['error' => "Body must include a non-empty 'lines' array"], 400];
        }

        $order = new Commande($db);
        if ($order->fetch($orderId) <= 0) {
            dol_syslog("DPK ShipmentController::create order not found id=" . $orderId, LOG_WARNING);
            return [['error' => 'Order not found'], 404];
        }

        $exp = new Expedition($db);
        $exp->socid = $order->socid;
        $exp->origin = 'commande';
        $exp->origin_id = $order->id;

        $delivery = self::normalizeTimestamp($arr['date_delivery'] ?? null);
        if ($delivery !== null) {
            $exp->date_delivery = $delivery;
        }
        if (isset($arr['tracking_number'])) {
            $exp->tracking_number = (string) $arr['tracking_number'];
        }
        if (!empty($arr['shipping_method_id'])) {
            $exp->shipping_method_id = (int) $arr['shipping_method_id'];
        }
        if (isset($arr['ref_customer'])) {
            $exp->ref_customer = (string) $arr['ref_customer'];
        }
        if (isset($arr['note_public'])) {
            $exp->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $exp->note_private = (string) $arr['note_private'];
        }

        // Build the in-memory shipment lines from the requested order lines.
        // addline() only appends to $exp->lines; create() persists them and
        // links the shipment back to the order via add_object_linked().
        $added = 0;
        foreach ($rawLines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $entrepotId = isset($line['entrepot_id']) ? (int) $line['entrepot_id'] : 0;
            $fkOriginLine = isset($line['fk_origin_line']) ? (int) $line['fk_origin_line'] : 0;
            $qty = isset($line['qty']) ? (float) $line['qty'] : 0.0;
            if ($fkOriginLine <= 0 || $qty <= 0) {
                continue;
            }
            $res = $exp->addline($entrepotId, $fkOriginLine, $qty);
            if ($res <= 0) {
                $reason = $exp->error !== '' ? $exp->error : 'Failed to add shipment line';
                dol_syslog("DPK ShipmentController::create addline() failed origin_line=" . $fkOriginLine . ": " . $reason, LOG_ERR);
                return [['error' => 'Failed to add shipment line: ' . $reason], 400];
            }
            $added++;
        }

        if ($added === 0) {
            dol_syslog("DPK ShipmentController::create no valid line to ship for order=" . $orderId, LOG_WARNING);
            return [['error' => 'No valid line to ship (each line needs fk_origin_line and qty > 0)'], 400];
        }

        $result = $exp->create($user);
        if ($result <= 0) {
            dol_syslog("DPK ShipmentController::create create() failed: " . $exp->error, LOG_ERR);
            return [['error' => 'Failed to create shipment: ' . $exp->error], 500];
        }

        $exp->fetch($result);
        return [$this->mapper->exportMappedData($exp), 201];
    }

    /**
     * Update header fields of a shipment (tracking, dates, notes, carrier).
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::update missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        // Override only the provided fields. Expedition::update() rewrites every
        // column from the in-memory object, so the fetch() above is mandatory to
        // preserve the untouched values (status, ref, dates, ...).
        if (array_key_exists('ref_customer', $arr)) {
            $exp->ref_customer = (string) $arr['ref_customer'];
        }
        if (array_key_exists('tracking_number', $arr)) {
            $exp->tracking_number = (string) $arr['tracking_number'];
        }
        if (array_key_exists('shipping_method_id', $arr)) {
            $exp->shipping_method_id = (int) $arr['shipping_method_id'] > 0 ? (int) $arr['shipping_method_id'] : null;
        }
        if (array_key_exists('note_public', $arr)) {
            $exp->note_public = (string) $arr['note_public'];
        }
        if (array_key_exists('note_private', $arr)) {
            $exp->note_private = (string) $arr['note_private'];
        }
        if (array_key_exists('date_delivery', $arr)) {
            $normalized = self::normalizeTimestamp($arr['date_delivery']);
            $exp->date_delivery = $normalized !== null ? $normalized : '';
        }

        $result = $exp->update($user);
        if ($result <= 0) {
            dol_syslog("DPK ShipmentController::update update() failed: " . $exp->error, LOG_ERR);
            return [['error' => 'Failed to update shipment: ' . $exp->error], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Delete a shipment.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'supprimer')) {
            dol_syslog("DPK ShipmentController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::destroy missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK ShipmentController::destroy delete() failed: " . $exp->error, LOG_ERR);
            return [['error' => 'Failed to delete shipment: ' . $exp->error], 500];
        }

        return [['message' => 'Shipment deleted'], 200];
    }

    /**
     * Validate a shipment (draft -> validated). Decrements stock when
     * STOCK_CALCULATE_ON_SHIPMENT is enabled (handled natively by Dolibarr).
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::validate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::validate missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::validate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->valid($user);
        if ($result <= 0) {
            $reason = $exp->error !== '' ? $exp->error : 'shipment not in draft status';
            dol_syslog("DPK ShipmentController::validate valid() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to validate shipment: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Close a shipment (validated -> closed). Decrements stock when
     * STOCK_CALCULATE_ON_SHIPMENT_CLOSE is enabled; closes the origin order if
     * every ordered quantity is now shipped (native Dolibarr behaviour).
     *
     * @param array|null $arr
     * @return array
     */
    public function closeShipment($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::closeShipment forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::closeShipment missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::closeShipment not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->setClosed();
        if ($result <= 0) {
            $reason = $exp->error !== '' ? $exp->error : 'Failed to close shipment';
            dol_syslog("DPK ShipmentController::closeShipment setClosed() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to close shipment: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Reopen a closed shipment (closed -> validated). Reverses the closing
     * stock movement when STOCK_CALCULATE_ON_SHIPMENT_CLOSE is enabled.
     *
     * @param array|null $arr
     * @return array
     */
    public function reopen($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::reopen forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::reopen missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::reopen not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->reOpen();
        if ($result < 0) {
            $reason = $exp->error !== '' ? $exp->error : 'Failed to reopen shipment';
            dol_syslog("DPK ShipmentController::reopen reOpen() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to reopen shipment: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Set a validated shipment back to draft.
     *
     * @param array|null $arr
     * @return array
     */
    public function setDraft($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::setDraft forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::setDraft missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::setDraft not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->setDraft($user);
        if ($result < 0) {
            $reason = $exp->error !== '' ? $exp->error : 'Failed to set shipment back to draft';
            dol_syslog("DPK ShipmentController::setDraft setDraft() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to set shipment back to draft: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Cancel a shipment. Reverses the stock movement when applicable (native
     * Dolibarr behaviour); refused if a delivery receipt is linked.
     *
     * @param array|null $arr
     * @return array
     */
    public function cancel($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::cancel forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ShipmentController::cancel missing id", LOG_WARNING);
            return [['error' => 'Shipment id is required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::cancel not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->cancel();
        if ($result <= 0) {
            $reason = $exp->error !== '' ? $exp->error : 'Failed to cancel shipment';
            dol_syslog("DPK ShipmentController::cancel cancel() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to cancel shipment: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /**
     * Delete a shipment line (draft only -- Dolibarr refuses it otherwise).
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteLine($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('expedition', 'creer')) {
            dol_syslog("DPK ShipmentController::deleteLine forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $lineid = isset($arr['lineid']) ? (int) $arr['lineid'] : 0;
        if ($id <= 0 || $lineid <= 0) {
            dol_syslog("DPK ShipmentController::deleteLine missing id or lineid", LOG_WARNING);
            return [['error' => 'Shipment id and line id are required'], 400];
        }

        $exp = new Expedition($db);
        if ($exp->fetch($id) <= 0) {
            dol_syslog("DPK ShipmentController::deleteLine not found id=" . $id, LOG_WARNING);
            return [['error' => 'Shipment not found'], 404];
        }

        $result = $exp->deleteline($user, $lineid);
        if ($result <= 0) {
            $reason = $exp->error !== '' ? $exp->error : 'Failed to delete shipment line';
            dol_syslog("DPK ShipmentController::deleteLine deleteline() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to delete shipment line: ' . $reason], 500];
        }

        $exp->fetch($id);
        return [$this->mapper->exportMappedData($exp), 200];
    }

    /** Wiring for the shared DocumentLinkTrait (linked objects box). */
    private function linkConfig()
    {
        return [
            'class'         => '\\Expedition',
            'permGroup'     => 'expedition',
            'logTag'        => 'ShipmentController',
            'notFoundLabel' => 'Shipment',
        ];
    }

    /** GET shipment/{id}/links -- linked objects (the origin order). */
    public function links($arr = null)
    {
        return $this->listLinks($arr, $this->linkConfig());
    }

    /** DELETE shipment/{id}/link/{rowid} -- unlink a related object. */
    public function linkRemove($arr = null)
    {
        return $this->removeLink($arr, $this->linkConfig());
    }
}
