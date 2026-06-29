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

dol_include_once('/compta/facture/class/facture-rec.class.php');
dol_include_once('/compta/facture/class/facture.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmInvoiceRec.php');

use FactureRec;
use Dolipocket\Api\Trait\PaginatedListTrait;

/**
 * Recurring invoice templates (FactureRec) API controller -- Tier A lot A5b.
 *
 * A template is created FROM an existing invoice (FactureRec::create($user,
 * $facid) copies its lines + thirdparty). It carries a frequency + a next
 * generation date; "generate now" drives the native
 * createRecurringInvoices($id) which respects the tenant (entity = $conf->entity,
 * a hard requirement kept by Dolibarr) and only generates when the template is
 * actually due. This controller never derives an accounting amount on its own.
 *
 * Statuses: suspended = 0 (active), 1 (suspended).
 *
 * Routes (singular):
 *   GET    invoicerec                 -> index
 *   GET    invoicerec/columns         -> columns
 *   GET    invoicerec/describe        -> describe
 *   GET    invoicerec/count           -> count
 *   GET    invoicerec/{id}            -> show
 *   POST   invoicerec                 -> create (from invoice)
 *   PUT    invoicerec/{id}            -> update
 *   DELETE invoicerec/{id}            -> destroy
 *   POST   invoicerec/{id}/generate  -> generate
 *   POST   invoicerec/{id}/suspend   -> suspend
 *   POST   invoicerec/{id}/unsuspend -> unsuspend
 */
class InvoiceRecController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'f.titre ASC, f.rowid DESC';

    /**
     * @var dmInvoiceRec Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmInvoiceRec();
    }

    /**
     * Sortable API key -> SQL column whitelist (aliased on "f").
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return [
            'ref'          => 'f.titre',
            'title'        => 'f.titre',
            'socid'        => 'f.fk_soc',
            'suspended'    => 'f.suspended',
            'frequency'    => 'f.frequency',
            'dateWhen'     => 'f.date_when',
            'nbGenDone'    => 'f.nb_gen_done',
            'totalTtc'     => 'f.total_ttc',
            'dateCreation' => 'f.datec',
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
            'ref'       => ['column' => 'f.titre', 'kind' => 'text'],
            'title'     => ['column' => 'f.titre', 'kind' => 'text'],
            'socid'     => ['column' => 'f.fk_soc', 'kind' => 'select'],
            'suspended' => ['column' => 'f.suspended', 'kind' => 'boolean'],
            'frequency' => ['column' => 'f.frequency', 'kind' => 'numberrange'],
            'dateWhen'  => ['column' => 'f.date_when', 'kind' => 'daterange'],
        ];
    }

    /**
     * SQL columns scanned by the global LIKE search (already aliased).
     *
     * @return array<int,string>
     */
    private function searchFields()
    {
        return ['f.titre'];
    }

    /**
     * List recurring invoice templates.
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceRecController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "facture_rec as f";
        $baseWhere = " WHERE f.entity IN (" . getEntity('facturerec') . ")";
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(f.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK InvoiceRecController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT f.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceRecController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $rec = new FactureRec($db);
            if ($rec->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK InvoiceRecController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
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
     * GET invoicerec/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceRecController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET invoicerec/describe
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceRecController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET invoicerec/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceRecController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());

        $sql = "SELECT COUNT(f.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "facture_rec as f";
        $sql .= " WHERE f.entity IN (" . getEntity('facturerec') . ")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceRecController::count SQL error: " . $db->lasterror(), LOG_ERR);
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
     * Legacy index handler (filters: socid, suspended, q).
     *
     * @param array|null $arr
     * @return array
     */
    private function indexLegacy($arr)
    {
        global $db;

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : 0;
        $suspended = isset($arr['suspended']) && $arr['suspended'] !== '' ? (int) $arr['suspended'] : null;
        $q = isset($arr['q']) ? trim((string) $arr['q']) : '';

        $sql = "SELECT f.rowid FROM " . MAIN_DB_PREFIX . "facture_rec as f";
        $sql .= " WHERE f.entity IN (" . getEntity('facturerec') . ")";
        if ($socid > 0) {
            $sql .= " AND f.fk_soc = " . $socid;
        }
        if ($suspended !== null) {
            $sql .= " AND f.suspended = " . $suspended;
        }
        if ($q !== '') {
            $like = "%" . $db->escape($q) . "%";
            $sql .= " AND f.titre LIKE '" . $like . "'";
        }
        $sql .= " ORDER BY f.titre ASC, f.rowid DESC";
        $sql .= $db->plimit(200, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK InvoiceRecController::indexLegacy sql error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $rec = new FactureRec($db);
            if ($rec->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK InvoiceRecController::indexLegacy fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $rec->lines = [];
            $items[] = $this->mapper->exportMappedData($rec);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single recurring invoice template with its lines.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'lire')) {
            dol_syslog("DPK InvoiceRecController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceRecController::show missing id", LOG_WARNING);
            return [['error' => 'Template id is required'], 400];
        }

        $rec = new FactureRec($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceRecController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Template not found'], 404];
        }
        $rec->fetch_lines();

        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Create a recurring template from an existing invoice.
     *
     * Body:
     *   - fk_facture     (int, required)  source invoice id (lines + thirdparty
     *                     are copied by FactureRec::create)
     *   - title          (string, required) template name
     *   - frequency      (int, optional)  >0 to make it recurring (0 = manual)
     *   - unit_frequency ('d'|'w'|'m'|'y', optional)
     *   - date_when      (optional) next generation date (s or ms)
     *   - nb_gen_max     (int, optional)  0 = unlimited
     *   - auto_validate  (0|1, optional)  validate generated invoices
     *   - usenewprice    (0|1, optional)  refresh product prices at generation
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceRecController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $facid = isset($arr['fk_facture']) ? (int) $arr['fk_facture'] : 0;
        $title = isset($arr['title']) ? trim((string) $arr['title']) : '';
        if ($facid <= 0) {
            dol_syslog("DPK InvoiceRecController::create missing fk_facture", LOG_WARNING);
            return [['error' => 'fk_facture (source invoice id) is required'], 400];
        }
        if ($title === '') {
            dol_syslog("DPK InvoiceRecController::create missing title", LOG_WARNING);
            return [['error' => 'title is required'], 400];
        }

        $rec = new FactureRec($db);
        $rec->title = $title;
        $rec->frequency = isset($arr['frequency']) ? (int) $arr['frequency'] : 0;
        $rec->unit_frequency = isset($arr['unit_frequency']) ? (string) $arr['unit_frequency'] : 'm';
        $rec->nb_gen_max = isset($arr['nb_gen_max']) ? (int) $arr['nb_gen_max'] : 0;
        $rec->auto_validate = !empty($arr['auto_validate']) ? 1 : 0;
        $rec->usenewprice = !empty($arr['usenewprice']) ? 1 : 0;
        $when = self::normalizeTimestamp($arr['date_when'] ?? null);
        if ($when !== null) {
            $rec->date_when = $when;
        }

        $result = $rec->create($user, $facid);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceRecController::create create() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to create recurring template: ' . $rec->error], 500];
        }

        $rec->fetch($result);
        $rec->fetch_lines();
        return [$this->mapper->exportMappedData($rec), 201];
    }

    /**
     * Update header fields of a recurring template (title, frequency, next
     * date, generation cap, flags, notes).
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceRecController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceRecController::update missing id", LOG_WARNING);
            return [['error' => 'Template id is required'], 400];
        }

        $rec = new FactureRec($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceRecController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Template not found'], 404];
        }

        if (array_key_exists('title', $arr)) {
            $rec->title = (string) $arr['title'];
            $rec->titre = (string) $arr['title'];
        }
        if (array_key_exists('frequency', $arr)) {
            $rec->frequency = (int) $arr['frequency'];
        }
        if (array_key_exists('unit_frequency', $arr)) {
            $rec->unit_frequency = (string) $arr['unit_frequency'];
        }
        if (array_key_exists('nb_gen_max', $arr)) {
            $rec->nb_gen_max = (int) $arr['nb_gen_max'];
        }
        if (array_key_exists('auto_validate', $arr)) {
            $rec->auto_validate = !empty($arr['auto_validate']) ? 1 : 0;
        }
        if (array_key_exists('usenewprice', $arr)) {
            $rec->usenewprice = !empty($arr['usenewprice']) ? 1 : 0;
        }
        if (array_key_exists('note_public', $arr)) {
            $rec->note_public = (string) $arr['note_public'];
        }
        if (array_key_exists('note_private', $arr)) {
            $rec->note_private = (string) $arr['note_private'];
        }
        if (array_key_exists('date_when', $arr)) {
            $when = self::normalizeTimestamp($arr['date_when']);
            $rec->date_when = $when !== null ? $when : null;
        }

        $result = $rec->update($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceRecController::update update() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to update recurring template: ' . $rec->error], 500];
        }

        $rec->fetch($id);
        $rec->fetch_lines();
        return [$this->mapper->exportMappedData($rec), 200];
    }

    /**
     * Delete a recurring template.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'supprimer')) {
            dol_syslog("DPK InvoiceRecController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceRecController::destroy missing id", LOG_WARNING);
            return [['error' => 'Template id is required'], 400];
        }

        $rec = new FactureRec($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceRecController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Template not found'], 404];
        }

        $result = $rec->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceRecController::destroy delete() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to delete recurring template: ' . $rec->error], 500];
        }

        return [['message' => 'Recurring template deleted'], 200];
    }

    /**
     * Generate the due invoice(s) for this template now. Drives the native
     * createRecurringInvoices(), which only generates when the template is due
     * (date_when <= today and nb_gen_done < nb_gen_max) and stays inside the
     * tenant (entity = $conf->entity). Returns the refreshed template plus a
     * 'generated' flag (true when a new invoice was actually produced).
     *
     * @param array|null $arr
     * @return array
     */
    public function generate($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceRecController::generate forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceRecController::generate missing id", LOG_WARNING);
            return [['error' => 'Template id is required'], 400];
        }

        $rec = new FactureRec($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceRecController::generate not found id=" . $id, LOG_WARNING);
            return [['error' => 'Template not found'], 404];
        }

        $before = (int) $rec->nb_gen_done;

        // Restrict the native batch generator to this template only.
        $res = $rec->createRecurringInvoices($id);
        if ($res != 0) {
            $reason = $rec->error !== '' ? $rec->error : ('generation reported ' . $res . ' error(s)');
            dol_syslog("DPK InvoiceRecController::generate createRecurringInvoices() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to generate invoice: ' . $reason], 500];
        }

        $rec->fetch($id);
        $rec->fetch_lines();
        $generated = ((int) $rec->nb_gen_done > $before);

        return [
            ['template' => $this->mapper->exportMappedData($rec), 'generated' => $generated],
            200,
        ];
    }

    /**
     * Suspend a template (stop generating).
     *
     * @param array|null $arr
     * @return array
     */
    public function suspend($arr = null)
    {
        return $this->setSuspended($arr, 1);
    }

    /**
     * Reactivate a suspended template.
     *
     * @param array|null $arr
     * @return array
     */
    public function unsuspend($arr = null)
    {
        return $this->setSuspended($arr, 0);
    }

    /**
     * Shared suspend/unsuspend implementation.
     *
     * @param array|null $arr
     * @param int        $value 1 = suspended, 0 = active
     * @return array
     */
    private function setSuspended($arr, $value)
    {
        global $db, $user;

        if (!$user->hasRight('facture', 'creer')) {
            dol_syslog("DPK InvoiceRecController::setSuspended forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK InvoiceRecController::setSuspended missing id", LOG_WARNING);
            return [['error' => 'Template id is required'], 400];
        }

        $rec = new FactureRec($db);
        if ($rec->fetch($id) <= 0) {
            dol_syslog("DPK InvoiceRecController::setSuspended not found id=" . $id, LOG_WARNING);
            return [['error' => 'Template not found'], 404];
        }

        $rec->suspended = (int) $value;
        $result = $rec->update($user);
        if ($result <= 0) {
            dol_syslog("DPK InvoiceRecController::setSuspended update() failed: " . $rec->error, LOG_ERR);
            return [['error' => 'Failed to update template status: ' . $rec->error], 500];
        }

        $rec->fetch($id);
        $rec->fetch_lines();
        return [$this->mapper->exportMappedData($rec), 200];
    }
}
