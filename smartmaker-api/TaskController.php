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

dol_include_once('/projet/class/task.class.php');
dol_include_once('/projet/class/project.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/DocumentContactTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmTask.php');

use Task;
use Project;
use Societe;
use Dolipocket\Api\Trait\PaginatedListTrait;
use Dolipocket\Api\Trait\DocumentContactTrait;

/**
 * Project task (projet_task) API controller -- lot B3.
 *
 * Tasks belong to a project (fk_projet) and form a tree (fk_task_parent + rang).
 * There is no dedicated 'task' rights class in Dolibarr: tasks inherit the
 * project rights (projet.lire/creer/supprimer). Access to a task is gated
 * through its parent project (entity + restrictedProjectArea).
 *
 * Statuses: fk_statut 0 draft, 1 to-do, 2 running, 3 finished, 4 transfered --
 * but the real completion driver is the progress field (0..100 %).
 *
 * Routes (singular):
 *   GET    task?project={id}      -> index (tasks of a project, or all)
 *   GET    task/columns           -> columns
 *   GET    task/describe          -> describe
 *   GET    task/count?project=    -> count
 *   GET    task/{id}              -> show
 *   POST   task                   -> create   (body: fk_project required)
 *   PUT    task/{id}              -> update
 *   DELETE task/{id}              -> destroy
 *   POST   task/{id}/clone        -> cloneTask
 *   GET    task/{id}/contacts     -> contacts
 *   POST   task/{id}/contact      -> contactAdd
 *   DELETE task/{id}/contact/{rowid} -> contactRemove
 */
class TaskController
{
    use PaginatedListTrait;
    use DocumentContactTrait;

    /** @var string Default ORDER BY (task hierarchy: by rang then start date). */
    private static $defaultSort = 't.rang ASC, t.dateo ASC, t.rowid ASC';

    /** @var dmTask */
    private $mapper;

    public function __construct()
    {
        $this->mapper = new dmTask();
    }

    /**
     * Sortable API key -> SQL column (aliased on "t"). Explicit map because
     * mapper doliside are PHP properties (date_start, fk_project) differing from
     * columns (dateo, fk_projet).
     *
     * @return array<string,string>
     */
    private function sortableMap()
    {
        return array(
            'ref'       => 't.ref',
            'label'     => 't.label',
            'dateStart' => 't.dateo',
            'dateEnd'   => 't.datee',
            'progress'  => 't.progress',
            'rang'      => 't.rang',
            'fkStatut'  => 't.fk_statut',
        );
    }

    /**
     * @return array<string,array{column:string,kind:string}>
     */
    private function filterMap()
    {
        return array(
            'ref'          => array('column' => 't.ref', 'kind' => 'text'),
            'label'        => array('column' => 't.label', 'kind' => 'text'),
            'fkProject'    => array('column' => 't.fk_projet', 'kind' => 'select'),
            'fkTaskParent' => array('column' => 't.fk_task_parent', 'kind' => 'select'),
            'fkStatut'     => array('column' => 't.fk_statut', 'kind' => 'select'),
        );
    }

    /** @return array<int,string> */
    private function searchFields()
    {
        return array('t.ref', 't.label');
    }

    /**
     * Verify a fetched task belongs to the current entity list.
     *
     * @param Task $task
     * @return bool
     */
    private function taskInCurrentEntity($task)
    {
        $allowed = array_map('intval', explode(',', getEntity('project')));
        return in_array((int) $task->entity, $allowed, true);
    }

    /**
     * Load the parent project of a task/operation, verifying entity + the given
     * restrictedProjectArea mode. Returns the Project on success or an
     * [errorPayload, code] array.
     *
     * @param int    $projectId
     * @param string $mode   'read' | 'write' | 'delete'
     * @param string $method
     * @return Project|array
     */
    private function requireProjectAccess($projectId, $mode, $method)
    {
        global $db, $user;

        if ($projectId <= 0) {
            dol_syslog("DPK TaskController::{$method} missing project id", LOG_WARNING);
            return array(array('error' => 'fk_project is required'), 400);
        }
        $project = new Project($db);
        if ($project->fetch($projectId) <= 0) {
            dol_syslog("DPK TaskController::{$method} project not found id=" . $projectId, LOG_WARNING);
            return array(array('error' => 'Project not found'), 404);
        }
        $allowed = array_map('intval', explode(',', getEntity('project')));
        if (!in_array((int) $project->entity, $allowed, true)) {
            dol_syslog("DPK TaskController::{$method} project cross-entity id=" . $projectId, LOG_WARNING);
            return array(array('error' => 'Project not found'), 404);
        }
        if ($project->restrictedProjectArea($user, $mode) <= 0) {
            dol_syslog("DPK TaskController::{$method} access denied project=" . $projectId . " user=" . $user->id, LOG_WARNING);
            return array(array('error' => 'Forbidden'), 403);
        }
        return $project;
    }

    /**
     * List tasks (optionally filtered by ?project=<id>). Returns the paginated
     * envelope when list params are present, otherwise a plain array (used by
     * the project "Tasks" section).
     *
     * @param array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK TaskController::index forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $projectId = isset($arr['project']) ? (int) $arr['project'] : 0;
        if ($projectId > 0) {
            $access = $this->requireProjectAccess($projectId, 'read', 'index');
            if (is_array($access)) {
                return $access;
            }
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM " . MAIN_DB_PREFIX . "projet_task as t";
        $baseWhere = " WHERE t.entity IN (" . getEntity('project') . ")";
        if ($projectId > 0) {
            $baseWhere .= " AND t.fk_projet = " . $projectId;
        }
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $where = $baseWhere . $filterWhere;

        $hasList = $this->hasListParams($arr);

        $countSql = "SELECT COUNT(t.rowid) as nb" . $baseFrom . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK TaskController::index count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClause($params, $this->sortableMap(), self::$defaultSort);
        $sql = "SELECT t.rowid" . $baseFrom . $where . $orderBy;
        // The task section may fetch up to a few hundred tasks; cap generously.
        $limit = $hasList ? (int) $params['limit'] : 500;
        $offset = $hasList ? (int) $params['offset'] : 0;
        $sql .= $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK TaskController::index page SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = array();
        while ($obj = $db->fetch_object($resql)) {
            $task = new Task($db);
            if ($task->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK TaskController::index fetch failed rowid=" . $obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->mapper->exportMappedDataFiltered($task, $includeKeys);
        }
        $db->free($resql);

        if ($hasList) {
            return [$this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']), 200];
        }
        return [$items, 200];
    }

    /** GET task/columns */
    public function columns($arr = null)
    {
        global $user;
        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK TaskController::columns forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        return [$this->mapper->getColumnCatalog(), 200];
    }

    /** GET task/describe */
    public function describe($arr = null)
    {
        global $user;
        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK TaskController::describe forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        return [$this->mapper->objectDesc(), 200];
    }

    /** GET task/count?project= */
    public function count($arr = null)
    {
        global $db, $user;
        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog("DPK TaskController::count forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }
        $params = $this->parseListParams($arr);
        $projectId = isset($arr['project']) ? (int) $arr['project'] : 0;
        list($filterWhere, ) = $this->buildSqlFilters($params, $this->filterMap(), $this->searchFields());
        $sql = "SELECT COUNT(t.rowid) as nb FROM " . MAIN_DB_PREFIX . "projet_task as t";
        $sql .= " WHERE t.entity IN (" . getEntity('project') . ")";
        if ($projectId > 0) {
            $sql .= " AND t.fk_projet = " . $projectId;
        }
        $sql .= $filterWhere;
        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK TaskController::count SQL error: " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);
        return [['total' => $total], 200];
    }

    /**
     * @param array|null $arr
     * @return array<int,string>|null
     */
    private function parseIncludeKeys($arr)
    {
        if (!is_array($arr) || empty($arr['include'])) {
            return null;
        }
        $keys = array();
        foreach (explode(',', (string) $arr['include']) as $k) {
            $k = trim($k);
            if ($k !== '') {
                $keys[] = $k;
            }
        }
        return empty($keys) ? null : $keys;
    }

    /**
     * Fetch a task after permission + entity checks.
     *
     * @param array|null $arr
     * @param string     $right  'lire' | 'creer' | 'supprimer'
     * @param string     $method
     * @return Task|array
     */
    private function taskFetchOrError($arr, $right, $method)
    {
        global $db, $user;

        if (!$user->hasRight('projet', $right)) {
            dol_syslog("DPK TaskController::{$method} forbidden user=" . $user->id, LOG_WARNING);
            return array(array('error' => 'Forbidden'), 403);
        }
        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK TaskController::{$method} missing id", LOG_WARNING);
            return array(array('error' => 'Task id is required'), 400);
        }
        $task = new Task($db);
        if ($task->fetch($id) <= 0) {
            dol_syslog("DPK TaskController::{$method} not found id=" . $id, LOG_WARNING);
            return array(array('error' => 'Task not found'), 404);
        }
        if (!$this->taskInCurrentEntity($task)) {
            dol_syslog("DPK TaskController::{$method} cross-entity id=" . $id, LOG_WARNING);
            return array(array('error' => 'Task not found'), 404);
        }
        return $task;
    }

    /** GET task/{id} */
    public function show($arr = null)
    {
        $taskOrError = $this->taskFetchOrError($arr, 'lire', 'show');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        return [$this->mapper->exportMappedData($taskOrError), 200];
    }

    /**
     * Apply provided writable fields onto a task object.
     *
     * @param Task  $task
     * @param array $arr
     * @return void
     */
    private function applyWritableFields($task, $arr)
    {
        if (!is_array($arr)) {
            return;
        }
        if (array_key_exists('label', $arr)) {
            $task->label = trim((string) $arr['label']);
        }
        if (array_key_exists('description', $arr)) {
            $task->description = (string) $arr['description'];
        }
        if (array_key_exists('fk_task_parent', $arr)) {
            $task->fk_task_parent = (int) $arr['fk_task_parent'];
        }
        if (array_key_exists('date_start', $arr)) {
            $ts = self::normalizeTimestamp($arr['date_start']);
            $task->date_start = $ts !== null ? $ts : '';
        }
        if (array_key_exists('date_end', $arr)) {
            $ts = self::normalizeTimestamp($arr['date_end']);
            $task->date_end = $ts !== null ? $ts : '';
        }
        if (array_key_exists('planned_workload', $arr)) {
            // planned_workload is stored in SECONDS (same unit as read); the
            // front converts hours <-> seconds itself.
            $task->planned_workload = ($arr['planned_workload'] === '' || $arr['planned_workload'] === null)
                ? '' : (int) $arr['planned_workload'];
        }
        if (array_key_exists('progress', $arr)) {
            $task->progress = ($arr['progress'] === '' || $arr['progress'] === null) ? '' : (int) $arr['progress'];
        }
        if (array_key_exists('priority', $arr)) {
            $task->priority = ($arr['priority'] === '' || $arr['priority'] === null) ? '' : (int) $arr['priority'];
        }
        if (array_key_exists('budget_amount', $arr)) {
            $task->budget_amount = ($arr['budget_amount'] === '' || $arr['budget_amount'] === null) ? '' : (float) $arr['budget_amount'];
        }
        if (array_key_exists('note_public', $arr)) {
            $task->note_public = (string) $arr['note_public'];
        }
        if (array_key_exists('note_private', $arr)) {
            $task->note_private = (string) $arr['note_private'];
        }
    }

    /** POST task -- body: fk_project (required), label (required), ... */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'creer')) {
            dol_syslog("DPK TaskController::create forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $projectId = isset($arr['fk_project']) ? (int) $arr['fk_project'] : 0;
        $access = $this->requireProjectAccess($projectId, 'write', 'create');
        if (is_array($access)) {
            return $access;
        }
        $project = $access;

        $label = isset($arr['label']) ? trim((string) $arr['label']) : '';
        if ($label === '') {
            dol_syslog("DPK TaskController::create missing label", LOG_WARNING);
            return [['error' => 'label is required'], 400];
        }

        $task = new Task($db);
        $task->entity = (int) $project->entity;
        $task->fk_project = $projectId;
        $task->label = $label;
        $this->applyWritableFields($task, $arr);
        // fk_task_parent defaults to 0 (top level) unless provided.
        if (!array_key_exists('fk_task_parent', $arr)) {
            $task->fk_task_parent = 0;
        }

        $ref = $this->generateTaskRef($task, $project);
        if ($ref !== '') {
            $task->ref = $ref;
        }

        $result = $task->create($user);
        if ($result <= 0) {
            $reason = !empty($task->errors) ? implode('; ', $task->errors) : $task->error;
            dol_syslog("DPK TaskController::create create() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to create task: ' . $reason], 500];
        }

        // Assign the creator as internal TASKEXECUTIVE (grants timesheet access).
        $resContact = $task->add_contact($user->id, 'TASKEXECUTIVE', 'internal');
        if ($resContact < 0) {
            dol_syslog("DPK TaskController::create add_contact(TASKEXECUTIVE) failed: " . $task->error, LOG_WARNING);
        }

        $task->fetch($result);
        return [$this->mapper->exportMappedData($task), 201];
    }

    /**
     * Generate the next task reference via the numbering module.
     *
     * @param Task    $task
     * @param Project $project
     * @return string  Empty string on failure.
     */
    private function generateTaskRef($task, $project)
    {
        $modele = getDolGlobalString('PROJECT_TASK_ADDON', 'mod_task_simple');
        $file = dol_buildpath('/core/modules/project/task/' . $modele . '.php', 0);
        if (!file_exists($file)) {
            dol_syslog("DPK TaskController::generateTaskRef numbering module not found: " . $modele, LOG_WARNING);
            return '';
        }
        dol_include_once('/core/modules/project/task/' . $modele . '.php');
        if (!class_exists($modele)) {
            dol_syslog("DPK TaskController::generateTaskRef numbering class not found: " . $modele, LOG_WARNING);
            return '';
        }
        $thirdparty = null;
        if (!empty($project->socid)) {
            $thirdparty = new Societe($GLOBALS['db']);
            if ($thirdparty->fetch((int) $project->socid) <= 0) {
                $thirdparty = null;
            }
        }
        $mod = new $modele();
        $ref = $mod->getNextValue($thirdparty, $task);
        if (!is_string($ref) || (is_numeric($ref) && (int) $ref <= 0)) {
            return '';
        }
        return (string) $ref;
    }

    /** PUT task/{id} */
    public function update($arr = null)
    {
        global $db, $user;

        $taskOrError = $this->taskFetchOrError($arr, 'creer', 'update');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        // Write access is gated on the parent project.
        $access = $this->requireProjectAccess((int) $task->fk_project, 'write', 'update');
        if (is_array($access)) {
            return $access;
        }

        // NB: the task was just fetched, so duration_effective is the real
        // denormalized total; applyWritableFields does not touch it, so
        // Task::update() preserves it.
        $this->applyWritableFields($task, $arr);

        $result = $task->update($user);
        if ($result <= 0) {
            $reason = !empty($task->errors) ? implode('; ', $task->errors) : $task->error;
            dol_syslog("DPK TaskController::update update() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to update task: ' . $reason], 500];
        }

        $task->fetch((int) $task->id);
        return [$this->mapper->exportMappedData($task), 200];
    }

    /** DELETE task/{id} */
    public function destroy($arr = null)
    {
        global $user;

        // A task can be deleted with projet->supprimer, or projet->creer.
        $right = $user->hasRight('projet', 'supprimer') ? 'supprimer' : 'creer';
        $taskOrError = $this->taskFetchOrError($arr, $right, 'destroy');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $access = $this->requireProjectAccess((int) $task->fk_project, 'delete', 'destroy');
        if (is_array($access)) {
            return $access;
        }

        // Task::delete() returns 0 (not negative) when BLOCKED by sub-tasks or
        // usage -- surface that as a clear 409, and treat <0 as a server error.
        $result = $task->delete($user);
        if ($result === 0) {
            $reason = !empty($task->errors) ? implode('; ', $task->errors) : 'Task has sub-tasks or is in use';
            dol_syslog("DPK TaskController::destroy blocked id=" . $task->id . ": " . $reason, LOG_WARNING);
            return [['error' => $reason], 409];
        }
        if ($result < 0) {
            $reason = !empty($task->errors) ? implode('; ', $task->errors) : $task->error;
            dol_syslog("DPK TaskController::destroy delete() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to delete task: ' . $reason], 500];
        }

        return [['message' => 'Task deleted'], 200];
    }

    /** POST task/{id}/clone */
    public function cloneTask($arr = null)
    {
        global $db, $user;

        $taskOrError = $this->taskFetchOrError($arr, 'creer', 'cloneTask');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $access = $this->requireProjectAccess((int) $task->fk_project, 'write', 'cloneTask');
        if (is_array($access)) {
            return $access;
        }

        $cloner = new Task($db);
        $newId = $cloner->createFromClone(
            $user,
            (int) $task->id,
            (int) $task->fk_project,
            (int) $task->fk_task_parent,
            false,  // clone_change_dt
            true,   // clone_affectation
            false,  // clone_time (not implemented in core)
            false,  // clone_file
            true,   // clone_note
            true    // clone_prog
        );
        if ($newId <= 0) {
            $reason = !empty($cloner->errors) ? implode('; ', $cloner->errors) : $cloner->error;
            dol_syslog("DPK TaskController::cloneTask createFromClone() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to clone task: ' . $reason], 500];
        }

        $clone = new Task($db);
        $clone->fetch($newId);
        return [$this->mapper->exportMappedData($clone), 201];
    }

    // ---- Time spent / timesheet (lot B4) ----

    /**
     * Resolve a user's display name (cached).
     *
     * @param int $userId
     * @return string
     */
    private function resolveUserName($userId)
    {
        global $db;
        static $cache = array();
        $userId = (int) $userId;
        if ($userId <= 0) {
            return '';
        }
        if (array_key_exists($userId, $cache)) {
            return $cache[$userId];
        }
        require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';
        $u = new \User($db);
        $name = '';
        if ($u->fetch($userId) > 0) {
            $name = trim(trim((string) $u->firstname . ' ' . (string) $u->lastname));
            if ($name === '') {
                $name = (string) $u->login;
            }
        }
        $cache[$userId] = $name;
        return $name;
    }

    /** GET task/{id}/timespent -- list time entries of a task. */
    public function timeList($arr = null)
    {
        global $db;

        $taskOrError = $this->taskFetchOrError($arr, 'lire', 'timeList');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        // Query llx_element_time directly rather than Task::fetchTimeSpentOnTask()
        // -- the latter reads an un-aliased $obj->project_public (a Dolibarr core
        // quirk) that raises an "Undefined property" notice. The task is already
        // entity-verified, so its time rows are tenant-scoped.
        $sql = "SELECT rowid, element_date, element_datehour, element_duration, fk_user, thm, note"
            . " FROM " . MAIN_DB_PREFIX . "element_time"
            . " WHERE elementtype = 'task' AND fk_element = " . ((int) $task->id)
            . " ORDER BY element_datehour DESC, rowid DESC";
        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK TaskController::timeList SQL error id=" . $task->id . ": " . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $lines = array();
        while ($obj = $db->fetch_object($resql)) {
            $fkUser = (int) $obj->fk_user;
            $ts = $db->jdate($obj->element_datehour);
            if (empty($ts)) {
                $ts = $db->jdate($obj->element_date);
            }
            $lines[] = array(
                'id'       => (int) $obj->rowid,
                'date'     => $ts ? (int) $ts : 0,
                'duration' => (int) $obj->element_duration,
                'fkUser'   => $fkUser,
                'userName' => $this->resolveUserName($fkUser),
                'thm'      => (float) $obj->thm,
                'note'     => (string) $obj->note,
            );
        }
        $db->free($resql);

        return [['lines' => $lines], 200];
    }

    /** GET task/{id}/timespent/summary -- aggregated totals. */
    public function timeSummary($arr = null)
    {
        $taskOrError = $this->taskFetchOrError($arr, 'lire', 'timeSummary');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $sum = $task->getSummaryOfTimeSpent();
        $out = array(
            'totalDuration'     => 0,
            'totalAmount'       => 0.0,
            'nblines'           => 0,
            'nblinesnull'       => 0,
            'durationEffective' => (int) $task->duration_effective,
        );
        if (is_array($sum)) {
            $out['totalDuration'] = (int) ($sum['total_duration'] ?? 0);
            $out['totalAmount']   = (float) ($sum['total_amount'] ?? 0);
            $out['nblines']       = (int) ($sum['nblines'] ?? 0);
            $out['nblinesnull']   = (int) ($sum['nblinesnull'] ?? 0);
        }
        return [$out, 200];
    }

    /**
     * POST task/{id}/timespent -- add a time entry.
     * Body: date (epoch s/ms), duration (seconds), fk_user (optional), note.
     */
    public function timeAdd($arr = null)
    {
        global $user;

        $taskOrError = $this->taskFetchOrError($arr, 'creer', 'timeAdd');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $access = $this->requireProjectAccess((int) $task->fk_project, 'write', 'timeAdd');
        if (is_array($access)) {
            return $access;
        }

        $date = self::normalizeTimestamp($arr['date'] ?? null);
        if ($date === null) {
            $date = dol_now();
        }
        $duration = isset($arr['duration']) ? (int) $arr['duration'] : 0;
        if ($duration <= 0) {
            dol_syslog("DPK TaskController::timeAdd invalid duration", LOG_WARNING);
            return [['error' => 'duration (in seconds) must be > 0'], 400];
        }
        $fkUser = isset($arr['fk_user']) && (int) $arr['fk_user'] > 0 ? (int) $arr['fk_user'] : (int) $user->id;

        $task->timespent_date = $date;
        $task->timespent_datehour = $date;
        $task->timespent_withhour = 0;
        $task->timespent_duration = $duration;
        $task->timespent_fk_user = $fkUser;
        $task->timespent_fk_product = 0;
        $task->timespent_note = isset($arr['note']) ? (string) $arr['note'] : '';

        $res = $task->addTimeSpent($user);
        if ($res <= 0) {
            $reason = !empty($task->errors) ? implode('; ', $task->errors) : $task->error;
            dol_syslog("DPK TaskController::timeAdd addTimeSpent() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to add time: ' . $reason], 500];
        }

        return $this->timeList(['id' => (int) $task->id]);
    }

    /**
     * Load a time-spent line into a fresh Task and verify it belongs to the
     * given task id. Returns the loaded Task or an [errorPayload, code] array.
     *
     * @param int $taskId
     * @param int $tsId
     * @param string $method
     * @return Task|array
     */
    private function timeLineFetchOrError($taskId, $tsId, $method)
    {
        global $db;

        if ($tsId <= 0) {
            dol_syslog("DPK TaskController::{$method} missing timespent id", LOG_WARNING);
            return array(array('error' => 'timespent id is required'), 400);
        }
        $ts = new Task($db);
        // fetchTimeSpent sets $ts->id = the line's fk_element (the owning task).
        if ($ts->fetchTimeSpent($tsId) <= 0) {
            dol_syslog("DPK TaskController::{$method} timespent not found id=" . $tsId, LOG_WARNING);
            return array(array('error' => 'Time entry not found'), 404);
        }
        if ((int) $ts->id !== (int) $taskId) {
            dol_syslog("DPK TaskController::{$method} timespent " . $tsId . " not on task " . $taskId, LOG_WARNING);
            return array(array('error' => 'Time entry not found on this task'), 404);
        }
        return $ts;
    }

    /** PUT task/{id}/timespent/{tsid} -- update a time entry. */
    public function timeUpdate($arr = null)
    {
        global $db, $user;

        $taskOrError = $this->taskFetchOrError($arr, 'creer', 'timeUpdate');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $access = $this->requireProjectAccess((int) $task->fk_project, 'write', 'timeUpdate');
        if (is_array($access)) {
            return $access;
        }

        $tsId = isset($arr['tsid']) ? (int) $arr['tsid'] : 0;
        $tsOrError = $this->timeLineFetchOrError((int) $task->id, $tsId, 'timeUpdate');
        if (is_array($tsOrError)) {
            return $tsOrError;
        }
        $ts = $tsOrError;

        // Preserve any invoice link (billing is out of scope in v1, but do not
        // silently unbill a line on edit): read the raw columns and carry them.
        $ts->timespent_invoiceid = 0;
        $ts->timespent_invoicelineid = 0;
        $rawSql = "SELECT invoice_id, invoice_line_id FROM " . MAIN_DB_PREFIX . "element_time WHERE rowid = " . $tsId;
        $rawRes = $db->query($rawSql);
        if ($rawRes) {
            $rawRow = $db->fetch_object($rawRes);
            if ($rawRow) {
                $ts->timespent_invoiceid = (int) ($rawRow->invoice_id ?? 0);
                $ts->timespent_invoicelineid = (int) ($rawRow->invoice_line_id ?? 0);
            }
            $db->free($rawRes);
        }

        if (isset($arr['date'])) {
            $d = self::normalizeTimestamp($arr['date']);
            if ($d !== null) {
                $ts->timespent_date = $d;
                $ts->timespent_datehour = $d;
            }
        }
        if (isset($arr['duration'])) {
            $ts->timespent_duration = (int) $arr['duration'];
        }
        if (isset($arr['fk_user']) && (int) $arr['fk_user'] > 0) {
            $ts->timespent_fk_user = (int) $arr['fk_user'];
        }
        if (array_key_exists('note', $arr)) {
            $ts->timespent_note = (string) $arr['note'];
        }

        $res = $ts->updateTimeSpent($user);
        if ($res <= 0) {
            $reason = !empty($ts->errors) ? implode('; ', $ts->errors) : $ts->error;
            dol_syslog("DPK TaskController::timeUpdate updateTimeSpent() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to update time: ' . $reason], 500];
        }

        return $this->timeList(['id' => (int) $task->id]);
    }

    /** DELETE task/{id}/timespent/{tsid} -- delete a time entry. */
    public function timeDelete($arr = null)
    {
        global $user;

        $taskOrError = $this->taskFetchOrError($arr, 'creer', 'timeDelete');
        if (is_array($taskOrError)) {
            return $taskOrError;
        }
        $task = $taskOrError;

        $access = $this->requireProjectAccess((int) $task->fk_project, 'write', 'timeDelete');
        if (is_array($access)) {
            return $access;
        }

        $tsId = isset($arr['tsid']) ? (int) $arr['tsid'] : 0;
        $tsOrError = $this->timeLineFetchOrError((int) $task->id, $tsId, 'timeDelete');
        if (is_array($tsOrError)) {
            return $tsOrError;
        }
        $ts = $tsOrError;

        $res = $ts->delTimeSpent($user);
        if ($res <= 0) {
            $reason = !empty($ts->errors) ? implode('; ', $ts->errors) : $ts->error;
            dol_syslog("DPK TaskController::timeDelete delTimeSpent() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to delete time: ' . $reason], 500];
        }

        return $this->timeList(['id' => (int) $task->id]);
    }

    // ---- Assignment / contacts (element 'project_task') ----

    /**
     * @return array
     */
    private function contactConfig()
    {
        return array(
            'class'         => '\\Task',
            'permGroup'     => 'projet',
            'logTag'        => 'TaskController',
            'notFoundLabel' => 'Task',
        );
    }

    /** GET task/{id}/contacts */
    public function contacts($arr = null)
    {
        return $this->listContacts($arr, $this->contactConfig());
    }

    /** POST task/{id}/contact */
    public function contactAdd($arr = null)
    {
        return $this->addContact($arr, $this->contactConfig());
    }

    /** DELETE task/{id}/contact/{rowid} */
    public function contactRemove($arr = null)
    {
        return $this->removeContact($arr, $this->contactConfig());
    }
}
