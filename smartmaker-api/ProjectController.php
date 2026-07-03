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

dol_include_once('/projet/class/project.class.php');
dol_include_once('/societe/class/societe.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/DocumentContactTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmProject.php');

use Project;
use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\DocumentContactTrait;

/**
 * Project (projet) API controller -- lot B1 of the desktop parity campaign.
 *
 * Extends the former read-only FK-lookup controller (Lot 9) into a full desktop
 * feature WITHOUT breaking the AutoForm <FkPicker> contract: index() still
 * returns the {items,total,page,limit} envelope AND every item still carries the
 * `id`, `ref`, `title`, `label` keys the picker reads (in addition to the full
 * mapper payload the DataTable consumes).
 *
 * Access control follows Dolibarr fidelity ("visibilite fidele Dolibarr"):
 *   - list       -> restricted to getProjectsAuthorizedForUser() (public OR I am
 *                   an internal contact), unless projet->all->lire.
 *   - show/edit/delete -> restrictedProjectArea() gate (read/write/delete).
 * The SaaS tenant admin is provisioned with projet->all->* so it sees everything
 * in its own entity; other users only see public + assigned projects.
 *
 * Statuses: 0 draft, 1 validated/open, 2 closed.
 *
 * Routes (singular):
 *   GET    project                 -> index (paginated envelope, FkPicker-safe)
 *   GET    project/columns         -> columns
 *   GET    project/describe        -> describe
 *   GET    project/count           -> count
 *   GET    project/{id}            -> show
 *   POST   project                 -> create
 *   PUT    project/{id}            -> update
 *   DELETE project                 -> deleteBulk
 *   DELETE project/{id}            -> destroy
 *   POST   project/{id}/validate   -> validate
 *   POST   project/{id}/close      -> close
 *   POST   project/{id}/reopen     -> reopen
 *   POST   project/{id}/setdraft   -> setDraft
 *   POST   project/{id}/clone      -> cloneProject
 */
class ProjectController
{
    use PaginatedListTrait;
    use DocumentContactTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'p.dateo DESC, p.rowid DESC';

    /**
     * @var dmProject Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor.
     */
    public function __construct()
    {
        $this->mapper = new dmProject();
    }

    /**
     * Sortable API key -> SQL column whitelist (aliased on "p"). Explicit map
     * (not catalog-driven) because mapper doliside keys are PHP property names
     * (statut, date_start, date_creation) that differ from the llx_projet
     * columns (fk_statut, dateo, datec).
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return [
            'ref'          => 'p.ref',
            'title'        => 'p.title',
            'socid'        => 'p.fk_soc',
            'dateStart'    => 'p.dateo',
            'dateEnd'      => 'p.datee',
            'dateCreation' => 'p.datec',
            'statut'       => 'p.fk_statut',
            'public'       => 'p.public',
            'oppAmount'    => 'p.opp_amount',
            'budgetAmount' => 'p.budget_amount',
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
            'ref'          => ['column' => 'p.ref', 'kind' => 'text'],
            'title'        => ['column' => 'p.title', 'kind' => 'text'],
            'socid'        => ['column' => 'p.fk_soc', 'kind' => 'select'],
            'statut'       => ['column' => 'p.fk_statut', 'kind' => 'select'],
            'public'       => ['column' => 'p.public', 'kind' => 'boolean'],
            'fkOppStatus'  => ['column' => 'p.fk_opp_status', 'kind' => 'select'],
            'dateStart'    => ['column' => 'p.dateo', 'kind' => 'daterange'],
            'dateEnd'      => ['column' => 'p.datee', 'kind' => 'daterange'],
            'dateCreation' => ['column' => 'p.datec', 'kind' => 'daterange'],
            'oppAmount'    => ['column' => 'p.opp_amount', 'kind' => 'numberrange'],
            'budgetAmount' => ['column' => 'p.budget_amount', 'kind' => 'numberrange'],
        ];
    }

    /**
     * SQL columns scanned by the global LIKE search (already aliased).
     *
     * @return array<int,string>
     */
    private function searchFields()
    {
        return ['p.ref', 'p.title'];
    }

    /**
     * Restrict a list query to the projects the user is allowed to see.
     *
     * Returns a SQL fragment (" AND p.rowid IN (...)") or '' when the user holds
     * projet->all->lire (sees every project of the entity). Mirrors list.php.
     *
     * @param  \User $user
     * @return string
     */
    private function authorizedProjectFilter($user)
    {
        global $db;

        // Admin (or explicit projet->all->lire) sees every project of the
        // entity -- no per-project contact restriction. The provisioned tenant
        // admin is granted projet->all->lire, but a bare admin flag is honoured
        // too (Dolibarr admins are effectively all-access on their entity).
        if (!empty($user->admin) || $user->hasRight('projet', 'all', 'lire')) {
            return '';
        }
        $probe = new Project($db);
        // list=1 -> comma-separated string of authorized rowids, '0' if none.
        $idsCsv = $probe->getProjectsAuthorizedForUser($user, 0, 1, 0);
        if (!is_string($idsCsv) || $idsCsv === '') {
            $idsCsv = '0';
        }
        return " AND p.rowid IN (" . $db->sanitize($idsCsv) . ")";
    }

    /**
     * List projects (paginated envelope, FkPicker-compatible items).
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK ProjectController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "projet as p";
        $baseWhere = " WHERE p.entity IN (" . getEntity('project') . ")";
        $baseWhere .= $this->authorizedProjectFilter($user);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $countSql = "SELECT COUNT(p.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ProjectController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT p.rowid" . $baseFrom . $where . $orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProjectController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $p = new Project($db);
            if ($p->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ProjectController::index fetch failed for rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $item = $this->mapper->exportMappedDataFiltered($p, $includeKeys);
            // Keep the FkPicker contract: always carry a human label + id/title/ref
            // even when ?include=... trimmed the business columns.
            if (is_object($item)) {
                $item->id = (int) $p->id;
                $item->ref = (string) $p->ref;
                $item->title = (string) $p->title;
                $item->label = trim(((string) $p->ref) . ' - ' . ((string) $p->title));
            }
            $items[] = $item;
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET project/columns
     *
     * @param array|null $arr
     * @return array
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK ProjectController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET project/describe
     *
     * @param array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK ProjectController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET project/count
     *
     * @param array|null $arr
     * @return array
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK ProjectController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());

        $sql = "SELECT COUNT(p.rowid) as nb";
        $sql .= " FROM " . MAIN_DB_PREFIX . "projet as p";
        $sql .= " WHERE p.entity IN (" . getEntity('project') . ")";
        $sql .= $this->authorizedProjectFilter($user);
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProjectController::count SQL error: " . $db->lasterror(), LOG_ERR);
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
     * Get a single project.
     *
     * @param array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK ProjectController::show forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::show missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::show not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        // Tenant guard: fetch() by rowid does not filter entity, so verify.
        if ((int) $project->entity !== (int) getEntity('project', 0)) {
            // getEntity returns the current entity list; a mismatch means this
            // project belongs to another tenant.
            if (!$this->belongsToCurrentEntity($project)) {
                dol_syslog("DPK ProjectController::show cross-entity id=" . $id, LOG_WARNING);
                return [['error' => 'Project not found'], 404];
            }
        }
        if ($project->restrictedProjectArea($user, 'read') <= 0) {
            dol_syslog("DPK ProjectController::show access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [$this->mapper->exportMappedData($project), 200];
    }

    /**
     * Verify a fetched project belongs to the current entity list.
     *
     * @param  Project $project
     * @return bool
     */
    private function belongsToCurrentEntity($project)
    {
        $allowed = array_map('intval', explode(',', getEntity('project')));
        return in_array((int) $project->entity, $allowed, true);
    }

    /**
     * Create a project (draft). ref is auto-generated via the numbering module.
     *
     * @param array|null $arr
     * @return array
     */
    public function create($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $title = isset($arr['title']) ? trim((string) $arr['title']) : '';
        if ($title === '') {
            dol_syslog("DPK ProjectController::create missing title", LOG_WARNING);
            return [['error' => 'title is required'], 400];
        }

        $socid = isset($arr['socid']) ? (int) $arr['socid'] : (isset($arr['fk_soc']) ? (int) $arr['fk_soc'] : 0);

        $project = new Project($db);
        $project->entity = (int) $conf->entity;
        $project->title = $title;
        if ($socid > 0) {
            $project->socid = $socid;
        }
        $this->applyWritableFields($project, $arr);

        // Generate the reference through the numbering module (like card.php),
        // because Project::create() does NOT auto-generate it.
        $ref = $this->generateRef($project, $socid);
        if ($ref === '') {
            dol_syslog("DPK ProjectController::create could not generate ref", LOG_ERR);
            return [['error' => 'Failed to generate project reference'], 500];
        }
        $project->ref = $ref;

        $result = $project->create($user);
        if ($result <= 0) {
            dol_syslog("DPK ProjectController::create create() failed: " . $project->error, LOG_ERR);
            return [['error' => 'Failed to create project: ' . $project->error], 500];
        }

        // Add the creator as internal PROJECTLEADER contact (mirrors card.php).
        $resContact = $project->add_contact($user->id, 'PROJECTLEADER', 'internal');
        if ($resContact < 0) {
            // Non-fatal: the project exists; log so the missing role is visible.
            dol_syslog("DPK ProjectController::create add_contact(PROJECTLEADER) failed: " . $project->error, LOG_WARNING);
        }

        $project->fetch($result);
        return [$this->mapper->exportMappedData($project), 201];
    }

    /**
     * Generate the next project reference via the configured numbering module.
     *
     * @param  Project $project
     * @param  int     $socid
     * @return string             Empty string on failure.
     */
    private function generateRef($project, $socid)
    {
        global $db;

        $modele = getDolGlobalString('PROJECT_ADDON', 'mod_project_simple');
        $file = dol_buildpath('/core/modules/project/' . $modele . '.php', 0);
        if (!file_exists($file)) {
            dol_syslog("DPK ProjectController::generateRef numbering module not found: " . $modele, LOG_ERR);
            return '';
        }
        dol_include_once('/core/modules/project/' . $modele . '.php');
        if (!class_exists($modele)) {
            dol_syslog("DPK ProjectController::generateRef numbering class not found: " . $modele, LOG_ERR);
            return '';
        }

        $thirdparty = null;
        if ($socid > 0) {
            $thirdparty = new Societe($db);
            if ($thirdparty->fetch($socid) <= 0) {
                $thirdparty = null;
            }
        }

        $modProject = new $modele();
        $ref = $modProject->getNextValue($thirdparty, $project);
        if (!is_string($ref) || (is_numeric($ref) && (int) $ref <= 0)) {
            return '';
        }
        return (string) $ref;
    }

    /**
     * Apply the writable header fields provided in the payload onto the object.
     *
     * @param  Project $project
     * @param  array   $arr
     * @return void
     */
    private function applyWritableFields($project, $arr)
    {
        if (!is_array($arr)) {
            return;
        }
        if (array_key_exists('title', $arr)) {
            $project->title = trim((string) $arr['title']);
        }
        if (array_key_exists('socid', $arr) || array_key_exists('fk_soc', $arr)) {
            $s = (int) ($arr['socid'] ?? $arr['fk_soc'] ?? 0);
            $project->socid = $s > 0 ? $s : 0;
        }
        if (array_key_exists('description', $arr)) {
            $project->description = (string) $arr['description'];
        }
        if (array_key_exists('public', $arr)) {
            $project->public = ((int) $arr['public']) ? 1 : 0;
        }
        if (array_key_exists('date_start', $arr)) {
            $ts = self::normalizeTimestamp($arr['date_start']);
            $project->date_start = $ts !== null ? $ts : '';
        }
        if (array_key_exists('date_end', $arr)) {
            $ts = self::normalizeTimestamp($arr['date_end']);
            $project->date_end = $ts !== null ? $ts : '';
        }
        if (array_key_exists('fk_opp_status', $arr) || array_key_exists('opp_status', $arr)) {
            $opp = (int) ($arr['fk_opp_status'] ?? $arr['opp_status'] ?? 0);
            $project->opp_status = $opp > 0 ? $opp : '';
        }
        if (array_key_exists('opp_percent', $arr)) {
            $project->opp_percent = ($arr['opp_percent'] === '' || $arr['opp_percent'] === null) ? '' : (float) $arr['opp_percent'];
        }
        if (array_key_exists('opp_amount', $arr)) {
            $project->opp_amount = ($arr['opp_amount'] === '' || $arr['opp_amount'] === null) ? '' : (float) $arr['opp_amount'];
        }
        if (array_key_exists('budget_amount', $arr)) {
            $project->budget_amount = ($arr['budget_amount'] === '' || $arr['budget_amount'] === null) ? '' : (float) $arr['budget_amount'];
        }
        if (array_key_exists('usage_opportunity', $arr)) {
            $project->usage_opportunity = ((int) $arr['usage_opportunity']) ? 1 : 0;
        }
        if (array_key_exists('usage_task', $arr)) {
            $project->usage_task = ((int) $arr['usage_task']) ? 1 : 0;
        }
        if (array_key_exists('usage_bill_time', $arr)) {
            $project->usage_bill_time = ((int) $arr['usage_bill_time']) ? 1 : 0;
        }
        if (array_key_exists('note_public', $arr)) {
            $project->note_public = (string) $arr['note_public'];
        }
        if (array_key_exists('note_private', $arr)) {
            $project->note_private = (string) $arr['note_private'];
        }
    }

    /**
     * Update a project header.
     *
     * @param array|null $arr
     * @return array
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::update forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::update missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::update not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if (!$this->belongsToCurrentEntity($project)) {
            dol_syslog("DPK ProjectController::update cross-entity id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if ($project->restrictedProjectArea($user, 'write') <= 0) {
            dol_syslog("DPK ProjectController::update access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $this->applyWritableFields($project, $arr);

        $result = $project->update($user);
        if ($result <= 0) {
            dol_syslog("DPK ProjectController::update update() failed: " . $project->error, LOG_ERR);
            return [['error' => 'Failed to update project: ' . $project->error], 500];
        }

        $project->fetch($id);
        return [$this->mapper->exportMappedData($project), 200];
    }

    /**
     * Delete a project.
     *
     * @param array|null $arr
     * @return array
     */
    public function destroy($arr = null)
    {
        global $db, $user;

        // A draft project can be deleted with projet->creer; otherwise
        // projet->supprimer is required. restrictedProjectArea does the fine
        // per-project gate.
        if (!$user->hasRight('projet', 'supprimer') && !$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::destroy forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::destroy missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::destroy not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if (!$this->belongsToCurrentEntity($project)) {
            dol_syslog("DPK ProjectController::destroy cross-entity id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }

        $isDraft = ((int) $project->statut === Project::STATUS_DRAFT);
        if (!$isDraft && $project->restrictedProjectArea($user, 'delete') <= 0) {
            dol_syslog("DPK ProjectController::destroy access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        if ($isDraft && !$user->hasRight('projet', 'creer') && $project->restrictedProjectArea($user, 'delete') <= 0) {
            dol_syslog("DPK ProjectController::destroy draft access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $result = $project->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK ProjectController::destroy delete() failed: " . $project->error, LOG_ERR);
            return [['error' => 'Failed to delete project: ' . $project->error], 500];
        }

        return [['message' => 'Project deleted'], 200];
    }

    /**
     * DELETE project (bulk).
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'supprimer') && !$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::deleteBulk forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK ProjectController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
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
            dol_syslog("DPK ProjectController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }
        if (count($ids) > 100) {
            dol_syslog("DPK ProjectController::deleteBulk too many ids: " . count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];
        foreach ($ids as $id) {
            $project = new Project($db);
            if ($project->fetch($id) <= 0) {
                dol_syslog("DPK ProjectController::deleteBulk not found id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Project not found'];
                continue;
            }
            if (!$this->belongsToCurrentEntity($project)) {
                dol_syslog("DPK ProjectController::deleteBulk cross-entity id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Project not found'];
                continue;
            }
            $isDraft = ((int) $project->statut === Project::STATUS_DRAFT);
            if (!$isDraft && $project->restrictedProjectArea($user, 'delete') <= 0) {
                dol_syslog("DPK ProjectController::deleteBulk access denied id=" . $id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Forbidden'];
                continue;
            }
            $resDel = $project->delete($user);
            if ($resDel <= 0) {
                $reason = $project->error !== '' ? $project->error : 'Failed to delete';
                dol_syslog("DPK ProjectController::deleteBulk failed id=" . $id . ": " . $reason, LOG_ERR);
                $errors[] = ['id' => $id, 'reason' => $reason];
                continue;
            }
            $success[] = $id;
        }

        return [['success' => $success, 'errors' => $errors], 200];
    }

    /**
     * Validate (draft -> validated/open).
     *
     * @param array|null $arr
     * @return array
     */
    public function validate($arr = null)
    {
        return $this->statusAction($arr, 'validate', function ($project, $user) {
            return $project->setValid($user);
        });
    }

    /**
     * Close (validated -> closed).
     *
     * @param array|null $arr
     * @return array
     */
    public function close($arr = null)
    {
        return $this->statusAction($arr, 'close', function ($project, $user) {
            return $project->setClose($user);
        });
    }

    /**
     * Reopen (closed -> validated). Project has no dedicated reopen: card.php
     * reuses setValid().
     *
     * @param array|null $arr
     * @return array
     */
    public function reopen($arr = null)
    {
        return $this->statusAction($arr, 'reopen', function ($project, $user) {
            return $project->setValid($user);
        });
    }

    /**
     * Set back to draft.
     *
     * @param array|null $arr
     * @return array
     */
    public function setDraft($arr = null)
    {
        return $this->statusAction($arr, 'setDraft', function ($project, $user) {
            return $project->setStatut(Project::STATUS_DRAFT, null, '', 'PROJECT_MODIFY');
        });
    }

    /**
     * Shared status-transition runner (fetch + entity + write gate + action).
     *
     * @param array|null $arr
     * @param string     $label
     * @param callable   $action  fn($project, $user): int  (>0 = OK)
     * @return array
     */
    private function statusAction($arr, $label, callable $action)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::{$label} forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::{$label} missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::{$label} not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if (!$this->belongsToCurrentEntity($project)) {
            dol_syslog("DPK ProjectController::{$label} cross-entity id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if ($project->restrictedProjectArea($user, 'write') <= 0) {
            dol_syslog("DPK ProjectController::{$label} access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $result = $action($project, $user);
        if ($result <= 0) {
            $reason = $project->error !== '' ? $project->error : ('action ' . $label . ' failed');
            dol_syslog("DPK ProjectController::{$label} failed: " . $reason, LOG_ERR);
            return [['error' => 'Action failed: ' . $reason], 500];
        }

        $project->fetch($id);
        return [$this->mapper->exportMappedData($project), 200];
    }

    /**
     * Duplicate a project (createFromClone). Returns the new draft. The clone
     * title is prefixed 'CopyOf ' by Dolibarr and must be renamed before it can
     * be validated (setValid rejects a 'CopyOf ' title).
     *
     * @param array|null $arr
     * @return array
     */
    public function cloneProject($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK ProjectController::cloneProject forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::cloneProject missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $probe = new Project($db);
        if ($probe->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::cloneProject not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if (!$this->belongsToCurrentEntity($probe)) {
            dol_syslog("DPK ProjectController::cloneProject cross-entity id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if ($probe->restrictedProjectArea($user, 'read') <= 0) {
            dol_syslog("DPK ProjectController::cloneProject access denied id=" . $id . " user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $cloneContacts = !empty($arr['clone_contacts']);
        $cloneTasks = array_key_exists('clone_tasks', $arr) ? !empty($arr['clone_tasks']) : true;
        $cloneNotes = array_key_exists('clone_notes', $arr) ? !empty($arr['clone_notes']) : true;
        $moveDate = !empty($arr['move_date']);
        $newSocid = isset($arr['socid']) ? (int) $arr['socid'] : 0;

        $cloner = new Project($db);
        $newId = $cloner->createFromClone(
            $user,
            $id,
            $cloneContacts,
            $cloneTasks,
            false,
            false,
            $cloneNotes,
            $moveDate,
            0,
            $newSocid
        );
        if ($newId <= 0) {
            dol_syslog("DPK ProjectController::cloneProject createFromClone() failed: " . $cloner->error, LOG_ERR);
            return [['error' => 'Failed to clone project: ' . $cloner->error], 500];
        }

        $clone = new Project($db);
        $clone->fetch($newId);
        return [$this->mapper->exportMappedData($clone), 201];
    }

    // ---- Contacts / intervenants (lot B2) ----

    /**
     * Wiring for the shared DocumentContactTrait (element 'project', roles
     * PROJECTLEADER / PROJECTCONTRIBUTOR, internal + external).
     *
     * @return array
     */
    private function contactConfig()
    {
        return array(
            'class'         => '\\Project',
            'permGroup'     => 'projet',
            'logTag'        => 'ProjectController',
            'notFoundLabel' => 'Project',
        );
    }

    /** GET project/{id}/contacts */
    public function contacts($arr = null)
    {
        return $this->listContacts($arr, $this->contactConfig());
    }

    /** POST project/{id}/contact */
    public function contactAdd($arr = null)
    {
        return $this->addContact($arr, $this->contactConfig());
    }

    /** DELETE project/{id}/contact/{rowid} */
    public function contactRemove($arr = null)
    {
        return $this->removeContact($arr, $this->contactConfig());
    }

    // ---- Categories / tags (TYPE_PROJECT) (lot B2) ----

    /**
     * Fetch a project for a category operation after permission + entity checks.
     *
     * @param array|null $arr
     * @param string     $right   'lire' or 'creer'
     * @param string     $method  for the syslog prefix
     * @return Project|array      Project on success, or [errorPayload, code].
     */
    private function categoryFetchOrError($arr, $right, $method)
    {
        global $db, $user;

        if (!$user->hasRight('projet', $right)) {
            dol_syslog("DPK ProjectController::{$method} forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProjectController::{$method} missing id", LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }
        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog("DPK ProjectController::{$method} not found id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        if (!$this->belongsToCurrentEntity($project)) {
            dol_syslog("DPK ProjectController::{$method} cross-entity id=" . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }
        return $project;
    }

    /** GET project/{id}/categories */
    public function categories($arr = null)
    {
        global $db;

        $projectOrError = $this->categoryFetchOrError($arr, 'lire', 'categories');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        $id = (int) $projectOrError->id;

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $assigned = array();
        $available = array();

        $cat = new \Categorie($db);
        $cur = $cat->containing($id, 'project', 'object');
        if (is_array($cur)) {
            foreach ($cur as $c) {
                $assigned[] = array('id' => (int) $c->id, 'label' => $c->label, 'type' => 'project');
            }
        }
        $arbo = $cat->get_full_arbo('project');
        if (is_array($arbo)) {
            foreach ($arbo as $a) {
                $label = !empty($a['fulllabel']) ? $a['fulllabel'] : (isset($a['label']) ? $a['label'] : '');
                $available[] = array('id' => (int) $a['id'], 'label' => $label, 'type' => 'project');
            }
        }

        return [['assigned' => $assigned, 'available' => $available], 200];
    }

    /** POST project/{id}/category -- body: category_id (int). */
    public function categoryAdd($arr = null)
    {
        global $db;

        $projectOrError = $this->categoryFetchOrError($arr, 'creer', 'categoryAdd');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        $catId = isset($arr['category_id']) ? (int) $arr['category_id'] : 0;
        if ($catId <= 0) {
            dol_syslog("DPK ProjectController::categoryAdd missing category_id", LOG_WARNING);
            return [['error' => 'category_id is required'], 400];
        }

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $cat = new \Categorie($db);
        if ($cat->fetch($catId) <= 0) {
            dol_syslog("DPK ProjectController::categoryAdd category not found id=" . $catId, LOG_WARNING);
            return [['error' => 'Category not found'], 404];
        }
        $res = $cat->add_type($projectOrError, 'project');
        if ($res < 0) {
            dol_syslog("DPK ProjectController::categoryAdd add_type() failed: " . $cat->error, LOG_ERR);
            return [['error' => 'Failed to assign category: ' . $cat->error], 500];
        }

        return $this->categories(['id' => (int) $projectOrError->id]);
    }

    /** DELETE project/{id}/category/{categoryId} */
    public function categoryRemove($arr = null)
    {
        global $db;

        $projectOrError = $this->categoryFetchOrError($arr, 'creer', 'categoryRemove');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        $catId = isset($arr['categoryId']) ? (int) $arr['categoryId'] : 0;
        if ($catId <= 0) {
            dol_syslog("DPK ProjectController::categoryRemove missing categoryId", LOG_WARNING);
            return [['error' => 'categoryId is required'], 400];
        }

        require_once DOL_DOCUMENT_ROOT . '/categories/class/categorie.class.php';
        $cat = new \Categorie($db);
        if ($cat->fetch($catId) <= 0) {
            dol_syslog("DPK ProjectController::categoryRemove category not found id=" . $catId, LOG_WARNING);
            return [['error' => 'Category not found'], 404];
        }
        $res = $cat->del_type($projectOrError, 'project');
        if ($res < 0) {
            dol_syslog("DPK ProjectController::categoryRemove del_type() failed: " . $cat->error, LOG_ERR);
            return [['error' => 'Failed to unassign category: ' . $cat->error], 500];
        }

        return $this->categories(['id' => (int) $projectOrError->id]);
    }

    // ---- Referents / linked objects (lot B2b) ----

    /**
     * Curated list of object types that can be linked to a project through a
     * dedicated fk_projet / fk_project column (NOT llx_element_element). Only
     * the types active in a Dolipocket tenant are declared; each is gated by
     * isModEnabled + read right at runtime.
     *
     * Keys: type, table (llx_<table>), field (project fk column), refcol (label
     * column), module (isModEnabled), right (hasRight path), label, routeBase
     * (React URL base for the front link).
     *
     * @return array<int,array<string,mixed>>
     */
    private function referentTypes()
    {
        return array(
            array('type' => 'propal',            'table' => 'propal',               'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'propal',            'right' => array('propal', 'lire'),                'label' => 'Devis',                 'routeBase' => '/proposals'),
            array('type' => 'order',             'table' => 'commande',             'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'commande',          'right' => array('commande', 'lire'),              'label' => 'Commandes',             'routeBase' => '/orders'),
            array('type' => 'invoice',           'table' => 'facture',              'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'facture',           'right' => array('facture', 'lire'),               'label' => 'Factures',              'routeBase' => '/invoices'),
            array('type' => 'supplier_proposal', 'table' => 'supplier_proposal',    'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'supplier_proposal', 'right' => array('supplier_proposal', 'lire'),     'label' => 'Demandes de prix',      'routeBase' => '/supplier-proposals'),
            array('type' => 'order_supplier',    'table' => 'commande_fournisseur', 'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'fournisseur',       'right' => array('fournisseur', 'commande', 'lire'), 'label' => 'Commandes fournisseur', 'routeBase' => '/supplier-orders'),
            array('type' => 'invoice_supplier',  'table' => 'facture_fourn',        'field' => 'fk_projet', 'refcol' => 'ref',   'module' => 'fournisseur',       'right' => array('fournisseur', 'facture', 'lire'),  'label' => 'Factures fournisseur',  'routeBase' => '/supplier-invoices'),
            array('type' => 'agenda',            'table' => 'actioncomm',           'field' => 'fk_project', 'refcol' => 'label', 'module' => 'agenda',            'right' => array('agenda', 'myactions', 'read'),   'label' => 'Événements',            'routeBase' => '/agenda'),
        );
    }

    /**
     * Whether the current user may read a given referent type (module active +
     * right, admin bypass via DocumentContactTrait::contactHasRight).
     *
     * @param array $def
     * @return bool
     */
    private function referentReadable(array $def)
    {
        if (!isModEnabled($def['module'])) {
            return false;
        }
        $right = $def['right'];
        if (count($right) === 3) {
            return $this->contactHasRight(array($right[0], $right[1]), $right[2]);
        }
        return $this->contactHasRight($right[0], $right[1]);
    }

    /** GET project/{id}/elements -- objects linked to the project, grouped by type. */
    public function linkedObjects($arr = null)
    {
        global $db;

        $projectOrError = $this->categoryFetchOrError($arr, 'lire', 'linkedObjects');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        $projectId = (int) $projectOrError->id;

        $groups = array();
        foreach ($this->referentTypes() as $def) {
            if (!$this->referentReadable($def)) {
                continue;
            }
            $table = MAIN_DB_PREFIX . $def['table'];
            $field = $def['field'];
            $refcol = $def['refcol'];

            // fk_projet references a globally-unique project rowid, and the
            // project is already verified to belong to the current entity, so a
            // row linking to it necessarily belongs to this tenant.
            $sql = "SELECT rowid, " . $refcol . " as reflabel FROM " . $table
                . " WHERE " . $field . " = " . $projectId
                . " ORDER BY rowid DESC" . $db->plimit(200, 0);
            $resql = $db->query($sql);
            if (!$resql) {
                dol_syslog("DPK ProjectController::linkedObjects SQL error (" . $def['type'] . "): " . $db->lasterror(), LOG_ERR);
                continue;
            }
            $items = array();
            while ($obj = $db->fetch_object($resql)) {
                $items[] = array(
                    'id'    => (int) $obj->rowid,
                    'ref'   => (string) ($obj->reflabel !== null ? $obj->reflabel : ('#' . $obj->rowid)),
                    'route' => $def['routeBase'] . '/' . (int) $obj->rowid,
                );
            }
            $db->free($resql);

            $groups[] = array(
                'type'  => $def['type'],
                'label' => $def['label'],
                'count' => count($items),
                'items' => $items,
            );
        }

        return [['groups' => $groups], 200];
    }

    /** DELETE project/{id}/element/{type}/{elementId} -- detach an object (fk=NULL). */
    public function detachElement($arr = null)
    {
        global $db, $user;

        $projectOrError = $this->categoryFetchOrError($arr, 'creer', 'detachElement');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        if ($projectOrError->restrictedProjectArea($user, 'write') <= 0) {
            dol_syslog("DPK ProjectController::detachElement access denied id=" . $projectOrError->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        $projectId = (int) $projectOrError->id;

        $type = isset($arr['type']) ? (string) $arr['type'] : '';
        $elementId = isset($arr['elementId']) ? (int) $arr['elementId'] : 0;
        if ($type === '' || $elementId <= 0) {
            dol_syslog("DPK ProjectController::detachElement missing type/elementId", LOG_WARNING);
            return [['error' => 'type and elementId are required'], 400];
        }

        $def = null;
        foreach ($this->referentTypes() as $d) {
            if ($d['type'] === $type) {
                $def = $d;
                break;
            }
        }
        if ($def === null) {
            dol_syslog("DPK ProjectController::detachElement unknown type=" . $type, LOG_WARNING);
            return [['error' => 'Unknown element type'], 400];
        }
        if (!$this->referentReadable($def)) {
            dol_syslog("DPK ProjectController::detachElement type not accessible=" . $type, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $table = MAIN_DB_PREFIX . $def['table'];
        $field = $def['field'];

        // Detach only if the element is actually linked to THIS project (guards
        // against tampering with an object from another tenant/project).
        $sql = "UPDATE " . $table . " SET " . $field . " = NULL"
            . " WHERE rowid = " . $elementId . " AND " . $field . " = " . $projectId;
        if (!$db->query($sql)) {
            dol_syslog("DPK ProjectController::detachElement SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        return $this->linkedObjects(['id' => $projectId]);
    }

    // ---- PDF generation (lot B5) ----

    /** POST project/{id}/generatepdf -- build the project PDF (model 'baleine'). */
    public function generatePdf($arr = null)
    {
        global $db, $user, $langs;

        $projectOrError = $this->categoryFetchOrError($arr, 'lire', 'generatePdf');
        if (is_array($projectOrError)) {
            return $projectOrError;
        }
        $project = $projectOrError;
        if ($project->restrictedProjectArea($user, 'read') <= 0) {
            dol_syslog("DPK ProjectController::generatePdf access denied id=" . $project->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $model = !empty($project->model_pdf) ? $project->model_pdf : getDolGlobalString('PROJECT_ADDON_PDF', 'baleine');

        $langs->load('projects');
        try {
            $result = $project->generateDocument($model, $langs);
        } catch (\Throwable $e) {
            dol_syslog("DPK ProjectController::generatePdf exception: " . $e->getMessage(), LOG_ERR);
            return [['error' => 'PDF generation failed: ' . $e->getMessage()], 500];
        }
        if ($result <= 0) {
            $reason = !empty($project->errors) ? implode('; ', $project->errors) : $project->error;
            dol_syslog("DPK ProjectController::generatePdf generateDocument() failed: " . $reason, LOG_ERR);
            return [['error' => 'PDF generation failed: ' . $reason], 500];
        }

        // Remember the chosen model for next time (best-effort).
        if (method_exists($project, 'setDocModel')) {
            $project->setDocModel($user, $model);
        }

        return [['message' => 'PDF generated', 'model' => $model, 'lastMainDoc' => (string) $project->last_main_doc], 200];
    }
}
