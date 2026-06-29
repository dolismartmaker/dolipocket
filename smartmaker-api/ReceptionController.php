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

dol_include_once('/reception/class/reception.class.php');
dol_include_once('/fourn/class/fournisseur.commande.class.php');
dol_include_once('/fourn/class/fournisseur.commande.dispatch.class.php');
dol_include_once('/product/class/product.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/DocumentLinkTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmReception.php');

use Reception;
use CommandeFournisseur;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\DocumentLinkTrait;

/**
 * Supplier reception (Reception) API controller -- Tier A lot A2.
 *
 * Supplier-side analog of ShipmentController: a reception is created FROM a
 * supplier order. The body carries the origin order id plus the lines to
 * receive ({entrepot_id, fk_commandefourndet, qty, cost_price?, batch?, ...}).
 * Stock is INCREMENTED by Dolibarr at validate() (STOCK_CALCULATE_ON_RECEPTION)
 * or at close() (STOCK_CALCULATE_ON_RECEPTION_CLOSE) -- this controller never
 * moves stock itself, it only drives the native Reception methods so the
 * behaviour matches reception/card.php exactly. Validation may also flag the
 * supplier order as partially / completely received (getStatusDispatch).
 *
 * Routes (singular, cf .claude/CLAUDE.md naming convention):
 *   GET    reception                       -> index   (paginated + legacy)
 *   GET    reception/columns               -> columns
 *   GET    reception/lines/columns         -> linesColumns
 *   GET    reception/describe              -> describe
 *   GET    reception/count                 -> count
 *   GET    reception/{id}                  -> show
 *   POST   reception                       -> create  (from supplier order)
 *   PUT    reception/{id}                  -> update
 *   DELETE reception/{id}                  -> destroy
 *   POST   reception/{id}/validate         -> validate
 *   POST   reception/{id}/close            -> closeReception
 *   POST   reception/{id}/reopen           -> reopen
 *   POST   reception/{id}/setdraft         -> setDraft
 *   GET    reception/{id}/links            -> links
 *   DELETE reception/{id}/link/{rowid}     -> linkRemove
 */
class ReceptionController
{
    use PaginatedListTrait;
    use DocumentLinkTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'r.date_reception DESC, r.rowid DESC';

    /**
     * @var dmReception Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmReception();
    }

    /**
     * Whitelist of sortable API keys -> real SQL columns (aliased on "r").
     *
     * Same rationale as ShipmentController: several mapper "doliside" keys are
     * PHP property names (statut, shipping_method_id, trueWeight) that differ
     * from the llx_reception column names (fk_statut, fk_shipping_method,
     * weight). This explicit map maps the camelCase API keys to the columns.
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return [
            'ref'            => 'r.ref',
            'refSupplier'    => 'r.ref_supplier',
            'socid'          => 'r.fk_soc',
            'dateReception'  => 'r.date_reception',
            'dateDelivery'   => 'r.date_delivery',
            'dateCreation'   => 'r.date_creation',
            'statut'         => 'r.fk_statut',
            'trackingNumber' => 'r.tracking_number',
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
            'ref'            => ['column' => 'r.ref', 'kind' => 'text'],
            'refSupplier'    => ['column' => 'r.ref_supplier', 'kind' => 'text'],
            'trackingNumber' => ['column' => 'r.tracking_number', 'kind' => 'text'],
            'socid'          => ['column' => 'r.fk_soc', 'kind' => 'select'],
            'statut'         => ['column' => 'r.fk_statut', 'kind' => 'select'],
            'dateReception'  => ['column' => 'r.date_reception', 'kind' => 'daterange'],
            'dateDelivery'   => ['column' => 'r.date_delivery', 'kind' => 'daterange'],
        ];
    }

    /**
     * SQL columns scanned by the global LIKE search (already aliased).
     *
     * @return array<int,string>
     */
    private function searchFields()
    {
        return ['r.ref', 'r.ref_supplier', 'r.tracking_number'];
    }

    /**
     * List receptions. Paginated envelope when a list param is present,
     * legacy raw array otherwise (filters: socid, status, q).
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "reception as r";
        $baseWhere = " WHERE r.entity IN (" . getEntity('reception') . ")";
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(r.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ReceptionController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT r.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ReceptionController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $rec = new Reception($db);
            if ($rec->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ReceptionController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            // fetch() forces fetch_lines(); drop the heavy lines block for the
            // list (totals stay on the $rec->total_* properties).
            $rec->lines = [];
            $items[] = $this->mapper->exportMappedDataFiltered($rec, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET reception/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET reception/lines/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function linesColumns($arr = null)
    {
        global $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::linesColumns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getLinesCatalog(), 200];
    }

    /**
     * GET reception/describe
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET reception/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());

        $sql = "SELECT COUNT(r.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "reception as r";
        $sql .= " WHERE r.entity IN (" . getEntity('reception') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ReceptionController::count SQL error: " . $db->lasterror(), LOG_ERR);
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

        $sql = "SELECT r.rowid FROM " . MAIN_DB_PREFIX . "reception as r";
        $sql .= " WHERE r.entity IN (" . getEntity('reception') . ")";
        if ($socid > 0) {
            $sql .= " AND r.fk_soc = " . $socid;
        }
        if ($status !== null) {
            $sql .= " AND r.fk_statut = " . $status;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND (r.ref LIKE '" . $like . "' OR r.ref_supplier LIKE '" . $like . "' OR r.tracking_number LIKE '" . $like . "')";
        }
        $sql .= " ORDER BY r.date_reception DESC, r.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ReceptionController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $rec = new Reception($db);
            if ($rec->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ReceptionController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $rec->lines = [];
            $items[] = $this->mapper->exportMappedData($rec);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single reception with its lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'lire')) {
            dol_syslog("DPK ReceptionController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::show missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Create a reception from a supplier order.
     *
     * Body:
     *   - origin_id          (int, required)  source supplier order id
     *   - lines              (array, required) each {entrepot_id, fk_commandefourndet,
     *                          qty, cost_price?, batch?, eatby?, sellby?, comment?}
     *   - date_delivery      (optional) planned delivery date (s or ms)
     *   - tracking_number    (optional)
     *   - shipping_method_id (optional)
     *   - ref_supplier       (optional)
     *   - note_public / note_private (optional)
     *
     * Mirrors reception/card.php: set origin = 'commande_fournisseur' +
     * origin_id, addline() for each received order line, then create(). Stock
     * is moved later, at validate()/close(), by Dolibarr -- not here.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $orderId = isset($arr['origin_id']) ? (int) $arr['origin_id'] : 0;
        if ($orderId <= 0) {
            dol_syslog("DPK ReceptionController::create missing origin_id (supplier order)", LOG_WARNING);
            return [['error' => 'origin_id (supplier order id) is required'], 400];
        }

        $rawLines = (is_array($arr) && isset($arr['lines']) && is_array($arr['lines'])) ? $arr['lines'] : null;
        if ($rawLines === null || empty($rawLines)) {
            dol_syslog("DPK ReceptionController::create missing or empty 'lines'", LOG_WARNING);
            return [['error' => "Body must include a non-empty 'lines' array"], 400];
        }

        $order = new CommandeFournisseur($db);
        if ($order->fetch($orderId) <= 0) {
            dol_syslog("DPK ReceptionController::create supplier order not found id=" . $orderId, LOG_WARNING);
            return [['error' => 'Supplier order not found'], 404];
        }

        $rec = new Reception($db);
        $rec->socid = $order->socid;
        $rec->origin = 'commande_fournisseur';
        $rec->origin_id = $order->id;

        $delivery = self::normalizeTimestamp($arr['date_delivery'] ?? null);
        if ($delivery !== null) {
            $rec->date_delivery = $delivery;
        }
        if (isset($arr['tracking_number'])) {
            $rec->tracking_number = (string) $arr['tracking_number'];
        }
        if (!empty($arr['shipping_method_id'])) {
            $rec->shipping_method_id = (int) $arr['shipping_method_id'];
        }
        if (isset($arr['ref_supplier'])) {
            $rec->ref_supplier = (string) $arr['ref_supplier'];
        }
        if (isset($arr['note_public'])) {
            $rec->note_public = (string) $arr['note_public'];
        }
        if (isset($arr['note_private'])) {
            $rec->note_private = (string) $arr['note_private'];
        }

        // Build the in-memory reception lines from the requested order lines.
        // Reception::addline() returns the new line INDEX (0 for the first
        // line), so a non-negative result is success; only < 0 is an error.
        $added = 0;
        foreach ($rawLines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $entrepotId = isset($line['entrepot_id']) ? (int) $line['entrepot_id'] : 0;
            $fkLine = isset($line['fk_commandefourndet']) ? (int) $line['fk_commandefourndet'] : 0;
            $qty = isset($line['qty']) ? (float) $line['qty'] : 0.0;
            if ($fkLine <= 0 || $qty <= 0) {
                continue;
            }
            $costPrice = isset($line['cost_price']) ? (float) $line['cost_price'] : 0;
            $batch = isset($line['batch']) ? (string) $line['batch'] : '';
            $comment = isset($line['comment']) ? (string) $line['comment'] : '';
            $eatby = self::normalizeTimestamp($line['eatby'] ?? null);
            $sellby = self::normalizeTimestamp($line['sellby'] ?? null);
            if ($eatby === null) $eatby = '';
            if ($sellby === null) $sellby = '';

            $res = $rec->addline($entrepotId, $fkLine, $qty, 0, $comment, $eatby, $sellby, $batch, $costPrice);
            if ($res < 0) {
                $reason = $rec->error !== '' ? $rec->error : 'Failed to add reception line';
                dol_syslog("DPK ReceptionController::create addline() failed order_line=" . $fkLine . ": " . $reason, LOG_ERR);
                return [['error' => 'Failed to add reception line: ' . $reason], 400];
            }
            $added++;
        }

        if ($added === 0) {
            dol_syslog("DPK ReceptionController::create no valid line to receive for order=" . $orderId, LOG_WARNING);
            return [['error' => 'No valid line to receive (each line needs fk_commandefourndet and qty > 0)'], 400];
        }

        $result = $rec->create($user);
        if ($result <= 0) {
            dol_syslog("DPK ReceptionController::create create() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to create reception: ' . $rec->error], 500];
        }

        $rec->fetch($result);
        return [$this->mapper->exportMappedData($rec), 201];
    }

    /**
     * Update header fields of a reception (tracking, dates, notes, carrier).
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::update missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        // Override only the provided fields. Reception::update() rewrites every
        // column from the in-memory object, so the fetch() above is mandatory to
        // preserve the untouched values (status, ref, dates, ...).
        if (array_key_exists('ref_supplier', $arr)) {
            $rec->ref_supplier = (string) $arr['ref_supplier'];
        }
        if (array_key_exists('tracking_number', $arr)) {
            $rec->tracking_number = (string) $arr['tracking_number'];
        }
        if (array_key_exists('shipping_method_id', $arr)) {
            $rec->shipping_method_id = (int) $arr['shipping_method_id'] > 0 ? (int) $arr['shipping_method_id'] : null;
        }
        if (array_key_exists('note_public', $arr)) {
            $rec->note_public = (string) $arr['note_public'];
        }
        if (array_key_exists('note_private', $arr)) {
            $rec->note_private = (string) $arr['note_private'];
        }
        if (array_key_exists('date_delivery', $arr)) {
            $normalized = self::normalizeTimestamp($arr['date_delivery']);
            $rec->date_delivery = $normalized !== null ? $normalized : '';
        }

        $result = $rec->update($user);
        if ($result <= 0) {
            dol_syslog("DPK ReceptionController::update update() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to update reception: ' . $rec->error], 500];
        }

        $rec->fetch($id);
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Delete a reception.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'supprimer')) {
            dol_syslog("DPK ReceptionController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::destroy missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        $result = $rec->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK ReceptionController::destroy delete() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to delete reception: ' . $rec->error], 500];
        }

        return [['message' => 'Reception deleted'], 200];
    }

    /**
     * Validate a reception (draft -> validated). Increments stock when
     * STOCK_CALCULATE_ON_RECEPTION is enabled and may flag the supplier order
     * as partially / completely received (handled natively by Dolibarr).
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::validate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::validate missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::validate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        $result = $rec->valid($user);
        if ($result <= 0) {
            $reason = $rec->error !== '' ? $rec->error : 'reception could not be validated';
            dol_syslog("DPK ReceptionController::validate valid() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to validate reception: ' . $reason], 500];
        }

        $rec->fetch($id);
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Close a reception (validated -> closed). Increments stock when
     * STOCK_CALCULATE_ON_RECEPTION_CLOSE is enabled; closes the origin supplier
     * order if every ordered quantity is now received (native Dolibarr).
     *
     * @param array|null $arr
     * @return array
     */
    public function closeReception($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::closeReception forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::closeReception missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::closeReception not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        $result = $rec->setClosed();
        if ($result <= 0) {
            $reason = $rec->error !== '' ? $rec->error : 'Failed to close reception';
            dol_syslog("DPK ReceptionController::closeReception setClosed() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to close reception: ' . $reason], 500];
        }

        $rec->fetch($id);
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Reopen a closed reception (closed -> validated).
     *
     * @param array|null $arr
     * @return array
     */
    public function reopen($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::reopen forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::reopen missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::reopen not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        $result = $rec->reOpen();
        if ($result < 0) {
            $reason = $rec->error !== '' ? $rec->error : 'Failed to reopen reception';
            dol_syslog("DPK ReceptionController::reopen reOpen() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to reopen reception: ' . $reason], 500];
        }

        $rec->fetch($id);
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Set a validated reception back to draft. Reverses the stock movement when
     * STOCK_CALCULATE_ON_RECEPTION is enabled (native Dolibarr behaviour).
     *
     * @param array|null $arr
     * @return array
     */
    public function setDraft($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('reception', 'creer')) {
            dol_syslog("DPK ReceptionController::setDraft forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ReceptionController::setDraft missing id", LOG_WARNING);
            return [['error' => 'Reception id is required'], 400];
        }

        $rec = new Reception($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK ReceptionController::setDraft not found id=" . $id, LOG_WARNING);
            return [['error' => 'Reception not found'], 404];
        }

        $result = $rec->setDraft($user);
        if ($result < 0) {
            $reason = $rec->error !== '' ? $rec->error : 'Failed to set reception back to draft';
            dol_syslog("DPK ReceptionController::setDraft setDraft() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to set reception back to draft: ' . $reason], 500];
        }

        $rec->fetch($id);
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /** Wiring for the shared DocumentLinkTrait (linked objects box). */
    private function linkConfig()
    {
        return [
            'class'         => '\\Reception',
            'permGroup'     => 'reception',
            'logTag'        => 'ReceptionController',
            'notFoundLabel' => 'Reception',
        ];
    }

    /** GET reception/{id}/links -- linked objects (the origin supplier order). */
    public function links($arr = null)
    {
        return $this->listLinks($arr, $this->linkConfig());
    }

    /** DELETE reception/{id}/link/{rowid} -- unlink a related object. */
    public function linkRemove($arr = null)
    {
        return $this->removeLink($arr, $this->linkConfig());
    }
}
