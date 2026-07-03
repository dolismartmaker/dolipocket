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
 */

namespace Dolipocket\Api;

require_once DOL_DOCUMENT_ROOT.'/comm/action/class/actioncomm.class.php';
require_once DOL_DOCUMENT_ROOT.'/core/class/extrafields.class.php';

dol_include_once('/dolipocket/smartmaker-api/dmAgenda.php');

use ActionComm;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * Agenda (ActionComm) controller for Dolipocket.
 *
 * Exposes the standard CRUD endpoints used by the mobile PWA. Entity scoping
 * relies on Dolibarr native getEntity('agenda') -- the JWT-resolved $conf->entity
 * is set per-tenant by SmartAuth before this controller runs.
 */
class AgendaController
{
    /**
     * Mapper instance, lazily created
     * @var dmAgenda|null
     */
    private $mapper;

    /**
     * Get (and lazily build) the agenda mapper.
     *
     * @return dmAgenda
     */
    private function getMapper()
    {
        if ($this->mapper === null) {
            $this->mapper = new dmAgenda();
        }
        return $this->mapper;
    }

    /**
     * List agenda events with optional filters.
     *
     * Supported query params: start (timestamp or ISO date), end (idem),
     * fk_user_assigned (int), socid (int), q (string label search), limit, page.
     *
     * @param array|null $arr Query parameters
     * @return array [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::index denied: missing agenda.myactions.read for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $start = isset($arr['start']) ? $this->parseDate($arr['start']) : null;
        $end = isset($arr['end']) ? $this->parseDate($arr['end']) : null;
        // Delta-sync watermark: when provided, only events modified after this
        // instant are returned (cf OPTI-DATA-ACCESS.md anti-pattern D). The
        // client keeps its cache and merges the delta by id.
        $since = isset($arr['since']) ? $this->parseDate($arr['since']) : null;
        $fkUserAssigned = !empty($arr['fk_user_assigned']) ? (int) $arr['fk_user_assigned'] : 0;
        $socid = !empty($arr['socid']) ? (int) $arr['socid'] : 0;
        $q = !empty($arr['q']) ? trim((string) $arr['q']) : '';
        // Safety cap only -- NOT pagination. A calendar window is already bounded
        // by start/end; a hard LIMIT would silently truncate events past the cap
        // and make them vanish from the grid (this is the exact bug documented in
        // OPTI-DATA-ACCESS.md anti-pattern B). Any hit is logged, never silent.
        $limit = isset($arr['limit']) ? min(5000, max(1, (int) $arr['limit'])) : 2000;

        // Parity filters (cf docs/AGENDA_FILTERS_SPEC.md). All numeric ones are
        // int-cast; actioncode codes are pattern-checked + escaped below.
        $type = !empty($arr['type']) ? (int) $arr['type'] : 0;
        $status = isset($arr['status']) ? (string) $arr['status'] : '';
        $usergroup = !empty($arr['usergroup']) ? (int) $arr['usergroup'] : 0;
        $projectid = !empty($arr['projectid']) ? (int) $arr['projectid'] : 0;
        $resourceid = !empty($arr['resourceid']) ? (int) $arr['resourceid'] : 0;
        $actioncode = isset($arr['actioncode']) ? trim((string) $arr['actioncode']) : '';
        $hideAuto = isset($arr['hideAuto'])
            && !in_array((string) $arr['hideAuto'], ['', '0', 'false'], true);
        $showBirthday = isset($arr['showbirthday'])
            && !in_array((string) $arr['showbirthday'], ['', '0', 'false'], true);

        $canSeeAll = $user->hasRight('agenda', 'allactions', 'read');

        // Single query, no N+1: read exactly the columns the calendar renders
        // instead of instantiating one ActionComm per row (which triggered
        // fetch + fetch_optionals + resources + COUNT(files) per event, i.e.
        // ~4 queries x N). Assigned-user resolution is not needed for the list
        // (the non-detailed shape derives fk_user_assigned from fk_user_action).
        $sql = "SELECT a.id, a.ref, a.label, c.code as type_code,";
        $sql .= " a.datep, a.datep2, a.percent, a.location, a.fulldayevent,";
        $sql .= " a.note as note_private, a.fk_user_action, a.fk_soc, a.fk_contact,";
        $sql .= " a.fk_element, a.elementtype, a.status, a.tms";
        $sql .= " FROM ".MAIN_DB_PREFIX."actioncomm AS a";
        $sql .= " LEFT JOIN ".MAIN_DB_PREFIX."c_actioncomm AS c ON a.fk_action = c.id";
        $sql .= " WHERE a.entity IN (".getEntity('agenda').")";

        // Limit visibility to owned/assigned events when allactions.read is
        // missing. EXISTS (not a JOIN) so rows are never duplicated.
        if (!$canSeeAll) {
            $sql .= " AND (a.fk_user_action = ".((int) $user->id);
            $sql .= " OR EXISTS (SELECT 1 FROM ".MAIN_DB_PREFIX."actioncomm_resources ar";
            $sql .= " WHERE ar.fk_actioncomm = a.id AND ar.element_type = 'user'";
            $sql .= " AND ar.fk_element = ".((int) $user->id)."))";
        }

        if ($fkUserAssigned > 0) {
            $sql .= " AND EXISTS (SELECT 1 FROM ".MAIN_DB_PREFIX."actioncomm_resources ar2";
            $sql .= " WHERE ar2.fk_actioncomm = a.id AND ar2.element_type = 'user'";
            $sql .= " AND ar2.fk_element = ".((int) $fkUserAssigned).")";
        }

        if ($socid > 0) {
            $sql .= " AND a.fk_soc = ".((int) $socid);
        }

        // Event type by dictionary id.
        if ($type > 0) {
            $sql .= " AND a.fk_action = ".((int) $type);
        }

        // Event type by code, or an auto/non-auto bucket (cf c_actioncomm.type).
        if ($actioncode === 'AC_NON_AUTO') {
            $sql .= " AND (c.type IS NULL OR c.type <> 'systemauto')";
        } elseif ($actioncode === 'AC_ALL_AUTO') {
            $sql .= " AND c.type = 'systemauto'";
        } elseif ($actioncode !== '') {
            $codes = [];
            foreach (explode(',', $actioncode) as $code) {
                $code = trim($code);
                if ($code !== '' && preg_match('/^[A-Za-z0-9_]+$/', $code)) {
                    $codes[] = "'".$db->escape($code)."'";
                }
            }
            if (!empty($codes)) {
                $sql .= " AND c.code IN (".implode(',', $codes).")";
            }
        }

        // Hide system-generated (journal) events -- the AC_*_AUTO noise.
        if ($hideAuto) {
            $sql .= " AND (c.type IS NULL OR c.type <> 'systemauto')";
        }

        // Advancement/status bucket (percent). Semantics mirror Dolibarr's
        // comm/action/index.php exactly.
        switch ($status) {
            case '0':
                $sql .= " AND a.percent = 0";
                break;
            case '50':
                $sql .= " AND (a.percent > 0 AND a.percent < 100)";
                break;
            case '100':
            case 'done':
                $sql .= " AND a.percent = 100";
                break;
            case 'todo':
                $sql .= " AND (a.percent >= 0 AND a.percent < 100)";
                break;
            case 'na':
            case '-1':
                $sql .= " AND a.percent = -1";
                break;
            default:
                break;
        }

        // Assigned to any user of a given group.
        if ($usergroup > 0) {
            $sql .= " AND EXISTS (SELECT 1 FROM ".MAIN_DB_PREFIX."actioncomm_resources arg";
            $sql .= " INNER JOIN ".MAIN_DB_PREFIX."usergroup_user ugu ON ugu.fk_user = arg.fk_element";
            $sql .= " WHERE arg.fk_actioncomm = a.id AND arg.element_type = 'user'";
            $sql .= " AND ugu.fk_usergroup = ".((int) $usergroup).")";
        }

        // Linked project.
        if ($projectid > 0) {
            $sql .= " AND a.fk_project = ".((int) $projectid);
        }

        // Linked resource (room, equipment...).
        if ($resourceid > 0) {
            $sql .= " AND EXISTS (SELECT 1 FROM ".MAIN_DB_PREFIX."element_resources er";
            $sql .= " WHERE er.element_type = 'action' AND er.element_id = a.id";
            $sql .= " AND er.resource_id = ".((int) $resourceid).")";
        }

        if ($start !== null) {
            $sql .= " AND (a.datep2 IS NULL OR a.datep2 >= '".$db->idate($start)."')";
        }
        if ($end !== null) {
            $sql .= " AND a.datep <= '".$db->idate($end)."'";
        }
        if ($since !== null) {
            $sql .= " AND a.tms > '".$db->idate($since)."'";
        }

        if ($q !== '') {
            $escaped = $db->escape($q);
            $sql .= " AND (a.label LIKE '%".$escaped."%' OR a.location LIKE '%".$escaped."%')";
        }

        $sql .= " ORDER BY a.datep ASC, a.id DESC";
        // Fetch one extra row to detect (and loudly log) a cap hit.
        $sql .= $db->plimit($limit + 1, 0);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK AgendaController::index SQL failed: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list events'], 500];
        }

        $events = [];
        while ($obj = $db->fetch_object($resql)) {
            $events[] = $this->formatRow($obj);
        }
        $db->free($resql);

        if (count($events) > $limit) {
            array_pop($events);
            dol_syslog('DPK AgendaController::index hit safety cap '.$limit.' (window pathologically dense); some events omitted', LOG_WARNING);
        }

        // Birthday virtual events (cf comm/action/index.php showbirthday). Only
        // on full loads (not delta `since` -- they have no tms) and when a window
        // is set. Occurrences are computed in PHP (portable: no MONTH()/DAY()).
        // Marked by a NEGATIVE id (= -contactId) so the frontend treats them as
        // read-only, non-navigable markers.
        if ($showBirthday && $since === null && $start !== null && $end !== null) {
            $sqlB = "SELECT rowid, firstname, lastname, birthday";
            $sqlB .= " FROM ".MAIN_DB_PREFIX."socpeople";
            $sqlB .= " WHERE (priv = 0 OR (priv = 1 AND fk_user_creat = ".((int) $user->id)."))";
            $sqlB .= " AND entity IN (".getEntity('contact').")";
            $sqlB .= " AND birthday IS NOT NULL";
            $resB = $db->query($sqlB);
            if ($resB) {
                $startYear = (int) date('Y', $start);
                $endYear = (int) date('Y', $end);
                while ($ob = $db->fetch_object($resB)) {
                    $parts = explode('-', substr((string) $ob->birthday, 0, 10));
                    if (count($parts) !== 3) {
                        continue;
                    }
                    $bMonth = (int) $parts[1];
                    $bDay = (int) $parts[2];
                    if ($bMonth < 1 || $bDay < 1) {
                        continue;
                    }
                    for ($y = $startYear; $y <= $endYear; $y++) {
                        $ts = (int) dol_mktime(0, 0, 0, $bMonth, $bDay, $y, 'gmt');
                        if ($ts < $start || $ts > $end) {
                            continue;
                        }
                        $name = trim(((string) $ob->firstname).' '.((string) $ob->lastname));
                        $events[] = [
                            'id'               => -((int) $ob->rowid),
                            'ref'              => '',
                            'label'            => 'Anniversaire '.$name,
                            'type_code'        => 'BIRTHDAY',
                            'datep'            => $ts,
                            'datef'            => $ts,
                            'percentage'       => 100,
                            'location'         => '',
                            'fulldayevent'     => 1,
                            'note'             => '',
                            'fk_user_action'   => 0,
                            'fk_user_assigned' => 0,
                            'socid'            => null,
                            'fk_soc'           => null,
                            'fk_contact'       => (int) $ob->rowid,
                            'fk_element'       => null,
                            'elementtype'      => '',
                            'status'           => 0,
                            'tms'              => null,
                        ];
                    }
                }
                $db->free($resB);
            } else {
                dol_syslog('DPK AgendaController::index birthday SQL failed: '.$db->lasterror(), LOG_ERR);
            }
        }

        return [$events, 200];
    }

    /**
     * Shape a raw SQL row (from index()'s single query) into the JSON output.
     *
     * Mirrors the non-detailed output of formatEvent() but consumes a plain
     * stdClass row instead of a fully fetched ActionComm object, so the list
     * endpoint stays at ONE query. Datetimes are converted to unix timestamps
     * via jdate() to match the appside mapper (which expects int seconds).
     *
     * @param  object $obj Row from the actioncomm SELECT.
     * @return array
     */
    private function formatRow($obj)
    {
        global $db;

        $socid = !empty($obj->fk_soc) ? (int) $obj->fk_soc : null;

        return [
            'id'               => (int) $obj->id,
            'ref'              => (string) $obj->ref,
            'label'            => (string) $obj->label,
            'type_code'        => (string) ($obj->type_code ?? ''),
            'datep'            => !empty($obj->datep) ? (int) $db->jdate($obj->datep) : null,
            'datef'            => !empty($obj->datep2) ? (int) $db->jdate($obj->datep2) : null,
            'percentage'       => (int) ($obj->percent ?? 0),
            'location'         => (string) ($obj->location ?? ''),
            'fulldayevent'     => !empty($obj->fulldayevent) ? 1 : 0,
            'note'             => (string) ($obj->note_private ?? ''),
            'fk_user_action'   => (int) ($obj->fk_user_action ?? 0),
            'fk_user_assigned' => (int) ($obj->fk_user_action ?? 0),
            'socid'            => $socid,
            'fk_soc'           => $socid,
            'fk_contact'       => !empty($obj->fk_contact) ? (int) $obj->fk_contact : null,
            'fk_element'       => !empty($obj->fk_element) ? (int) $obj->fk_element : null,
            'elementtype'      => (string) ($obj->elementtype ?? ''),
            'status'           => (int) ($obj->status ?? 0),
            'tms'              => !empty($obj->tms) ? (int) $db->jdate($obj->tms) : null,
        ];
    }

    /**
     * GET event/counts
     *
     * Aggregate counts over the given window (start/end), for the filter-bar
     * preset badges (cf docs/AGENDA_FILTERS_SPEC.md, B-front-3). Deliberately
     * IGNORES the UI facet filters: the badges must always reflect the whole
     * window ("12 to do") regardless of what is currently filtered, otherwise
     * "Terminees" would read 0 as soon as "A faire" is active. Only the entity
     * scope + the owned/assigned visibility restriction apply (like index()).
     *
     * One query, conditional SUMs (portable MySQL + SQLite).
     *
     * @param  array|null $arr Query params (start, end).
     * @return array            [data, httpCode]
     */
    public function counts($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::counts denied: missing agenda.myactions.read for user '.((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $start = isset($arr['start']) ? $this->parseDate($arr['start']) : null;
        $end = isset($arr['end']) ? $this->parseDate($arr['end']) : null;
        $canSeeAll = $user->hasRight('agenda', 'allactions', 'read');
        $uid = (int) $user->id;
        $nowSql = $db->idate(dol_now());

        // Owned-or-assigned predicate (reused for the "mine" bucket AND the
        // visibility restriction).
        $ownerPredicate = "(a.fk_user_action = ".$uid;
        $ownerPredicate .= " OR EXISTS (SELECT 1 FROM ".MAIN_DB_PREFIX."actioncomm_resources arc";
        $ownerPredicate .= " WHERE arc.fk_actioncomm = a.id AND arc.element_type = 'user'";
        $ownerPredicate .= " AND arc.fk_element = ".$uid."))";

        $sql = "SELECT COUNT(*) as total";
        $sql .= ", SUM(CASE WHEN a.percent >= 0 AND a.percent < 100 THEN 1 ELSE 0 END) as todo";
        $sql .= ", SUM(CASE WHEN a.percent = 100 THEN 1 ELSE 0 END) as done";
        $sql .= ", SUM(CASE WHEN a.percent >= 0 AND a.percent < 100 AND a.datep < '".$nowSql."' THEN 1 ELSE 0 END) as overdue";
        $sql .= ", SUM(CASE WHEN ".$ownerPredicate." THEN 1 ELSE 0 END) as mine";
        $sql .= " FROM ".MAIN_DB_PREFIX."actioncomm AS a";
        $sql .= " WHERE a.entity IN (".getEntity('agenda').")";
        if (!$canSeeAll) {
            $sql .= " AND ".$ownerPredicate;
        }
        if ($start !== null) {
            $sql .= " AND (a.datep2 IS NULL OR a.datep2 >= '".$db->idate($start)."')";
        }
        if ($end !== null) {
            $sql .= " AND a.datep <= '".$db->idate($end)."'";
        }

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK AgendaController::counts SQL failed: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to count events'], 500];
        }
        $obj = $db->fetch_object($resql);
        $db->free($resql);

        return [[
            'total'   => (int) ($obj->total ?? 0),
            'todo'    => (int) ($obj->todo ?? 0),
            'done'    => (int) ($obj->done ?? 0),
            'overdue' => (int) ($obj->overdue ?? 0),
            'mine'    => (int) ($obj->mine ?? 0),
        ], 200];
    }

    /**
     * GET event/filter-options
     *
     * Populates the calendar filter bar without hardcoding anything client-side
     * (cf docs/AGENDA_FILTERS_SPEC.md section 2.2). Returns the active event
     * types (with their colour + systemauto flag), the assignable user groups
     * (only when the caller may enumerate them), and the fixed advancement
     * buckets.
     *
     * @param  array|null $arr Unused (no params).
     * @return array            [data, httpCode]
     */
    public function filterOptions($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::filterOptions denied: missing agenda.myactions.read for user '.((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        // Event types. c_actioncomm is a GLOBAL dictionary (no entity column),
        // so it is never entity-filtered.
        $types = [];
        $sql = "SELECT id, code, libelle as label, color, type, picto";
        $sql .= " FROM ".MAIN_DB_PREFIX."c_actioncomm";
        $sql .= " WHERE active = 1";
        $sql .= " ORDER BY position ASC, id ASC";
        $resql = $db->query($sql);
        if ($resql) {
            while ($obj = $db->fetch_object($resql)) {
                $types[] = [
                    'id'         => (int) $obj->id,
                    'code'       => (string) $obj->code,
                    'label'      => (string) $obj->label,
                    'color'      => !empty($obj->color) ? (string) $obj->color : null,
                    'picto'      => !empty($obj->picto) ? (string) $obj->picto : null,
                    'systemauto' => ($obj->type === 'systemauto'),
                ];
            }
            $db->free($resql);
        } else {
            dol_syslog('DPK AgendaController::filterOptions types SQL failed: '.$db->lasterror(), LOG_ERR);
        }

        // User groups (assignment-by-group filter). Only exposed to callers
        // allowed to enumerate groups; otherwise an empty list so the filter
        // degrades to hidden client-side.
        $groups = [];
        if (!empty($user->admin) || $user->hasRight('user', 'user', 'lire')) {
            $sql = "SELECT rowid as id, nom as label";
            $sql .= " FROM ".MAIN_DB_PREFIX."usergroup";
            $sql .= " WHERE entity IN (".getEntity('usergroup').")";
            $sql .= " ORDER BY nom ASC";
            $resql = $db->query($sql);
            if ($resql) {
                while ($obj = $db->fetch_object($resql)) {
                    $groups[] = ['id' => (int) $obj->id, 'label' => (string) $obj->label];
                }
                $db->free($resql);
            } else {
                dol_syslog('DPK AgendaController::filterOptions groups SQL failed: '.$db->lasterror(), LOG_ERR);
            }
        }

        // Advancement buckets are fixed semantics (percent). Exposed here so the
        // UI does not hardcode them; labels are translated client-side by value.
        $statuses = [
            ['value' => 'todo', 'percentRule' => '0<=p<100'],
            ['value' => '0',    'percentRule' => 'p=0'],
            ['value' => '50',   'percentRule' => '0<p<100'],
            ['value' => 'done', 'percentRule' => 'p=100'],
            ['value' => 'na',   'percentRule' => 'p=-1'],
        ];

        return [[
            'types'    => $types,
            'groups'   => $groups,
            'statuses' => $statuses,
        ], 200];
    }

    /**
     * GET event/columns
     *
     * Returns the normalized column catalog for the DataTable / DocumentHeaderFields
     * consumer. Cf .claude/CLAUDE.md "Lot 6 v2 - DataTable single source of truth"
     * + "Lot 8 - Pages détail catalogue-driven".
     *
     * @param  array|null $arr Unused (no params).
     * @return array            [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::columns denied: missing agenda.myactions.read for user '.((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->getMapper()->getColumnCatalog(), 200];
    }

    /**
     * GET event/describe
     *
     * Returns the raw objectDesc() output (per-field metadata) for AutoForm.
     * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
     *
     * @param  array|null $arr Unused (no params).
     * @return array            [data, httpCode]
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::describe denied: missing agenda.myactions.read for user '.((int) $user->id), LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->getMapper()->objectDesc(), 200];
    }

    /**
     * Get a single agenda event by id.
     *
     * @param array|null $arr Route parameters (id)
     * @return array [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('agenda', 'myactions', 'read')) {
            dol_syslog('DPK AgendaController::show denied: missing agenda.myactions.read for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog('DPK AgendaController::show missing id parameter', LOG_WARNING);
            return [['error' => 'Event id is required'], 400];
        }

        $eventId = (int) $arr['id'];
        $event = new ActionComm($db);
        $result = $event->fetch($eventId);

        if ($result <= 0) {
            dol_syslog('DPK AgendaController::show event '.$eventId.' not found', LOG_WARNING);
            return [['error' => 'Event not found'], 404];
        }

        if (!$this->canAccessEvent($event, $user)) {
            dol_syslog('DPK AgendaController::show user '.$user->id.' denied access to event '.$eventId, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $event->fetch_optionals();
        if (method_exists($event, 'fetchResources')) {
            $event->fetchResources();
        }

        return [$this->formatEvent($event, $this->getMapper(), true), 200];
    }

    /**
     * Create a new agenda event.
     *
     * @param array|null $arr Request body
     * @return array [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('agenda', 'myactions', 'create')) {
            dol_syslog('DPK AgendaController::create denied: missing agenda.myactions.create for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['label']) || !is_string($arr['label'])) {
            dol_syslog('DPK AgendaController::create missing label', LOG_WARNING);
            return [['error' => 'Label is required'], 400];
        }

        $event = new ActionComm($db);
        $event->label = trim((string) $arr['label']);
        $event->type_code = !empty($arr['type_code']) ? (string) $arr['type_code'] : 'AC_OTH';
        $event->datep = !empty($arr['datep']) ? $this->parseDate($arr['datep']) : dol_now();
        $event->datef = !empty($arr['datef']) ? $this->parseDate($arr['datef']) : null;
        $event->fulldayevent = !empty($arr['fulldayevent']) ? 1 : 0;
        $event->location = isset($arr['location']) ? (string) $arr['location'] : '';
        $event->note_private = isset($arr['note']) ? (string) $arr['note'] : '';
        $event->percentage = isset($arr['percentage']) ? (int) $arr['percentage'] : 0;

        // Assigned user: accept the legacy write key fk_user_assigned first, then
        // the appside key fk_user_action produced by the desktop AutoForm mapper
        // (mapToBackend maps the FkPicker onto fk_user_action). Default to self.
        $assignedUserId = !empty($arr['fk_user_assigned'])
            ? (int) $arr['fk_user_assigned']
            : (!empty($arr['fk_user_action']) ? (int) $arr['fk_user_action'] : (int) $user->id);
        $event->userownerid = $assignedUserId;
        $event->userassigned = [
            $assignedUserId => ['id' => $assignedUserId, 'transparency' => 0],
        ];

        if (!empty($arr['socid'])) {
            $event->socid = (int) $arr['socid'];
        }
        if (!empty($arr['fk_contact'])) {
            $event->contact_id = (int) $arr['fk_contact'];
        }
        if (!empty($arr['fk_project'])) {
            $event->fk_project = (int) $arr['fk_project'];
        }
        if (!empty($arr['fk_element']) && !empty($arr['elementtype'])) {
            $event->fk_element = (int) $arr['fk_element'];
            $event->elementtype = (string) $arr['elementtype'];
        }

        $result = $event->create($user);
        if ($result <= 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors) ? implode('; ', $event->errors) : (string) $event->error;
            dol_syslog('DPK AgendaController::create create() failed: '.$errMsg, LOG_ERR);
            return [['error' => 'Failed to create event: '.$errMsg], 500];
        }

        $event->fetch($result);
        $event->fetch_optionals();

        return [$this->formatEvent($event, $this->getMapper(), true), 201];
    }

    /**
     * Update an existing agenda event.
     *
     * @param array|null $arr Route parameters (id) and request body
     * @return array [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (empty($arr['id'])) {
            dol_syslog('DPK AgendaController::update missing id parameter', LOG_WARNING);
            return [['error' => 'Event id is required'], 400];
        }

        $eventId = (int) $arr['id'];
        $event = new ActionComm($db);
        $result = $event->fetch($eventId);
        if ($result <= 0) {
            dol_syslog('DPK AgendaController::update event '.$eventId.' not found', LOG_WARNING);
            return [['error' => 'Event not found'], 404];
        }

        if (!$this->canEditEvent($event, $user)) {
            dol_syslog('DPK AgendaController::update user '.$user->id.' denied edit on event '.$eventId, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $payload = $arr;
        unset($payload['id']);

        // Legacy API write key fk_user_assigned has no entry in
        // listOfPublishedFields (the symmetric read key is fk_user_action).
        // Translate the legacy write key into the appside key the mapper
        // recognises BEFORE importMappedData() sees the payload, then drop it
        // (importMappedData would reject the unknown key otherwise).
        //
        // Guard on !empty, not isset: the desktop AutoForm mapper (mapToBackend)
        // always backfills fk_user_assigned=0 as a completeness default. A blind
        // rename would then clobber the real fk_user_action (assigned user) with
        // 0 on every save/move. Only override when a genuine assignee is sent.
        if (array_key_exists('fk_user_assigned', $payload)) {
            if (!empty($payload['fk_user_assigned'])) {
                $payload['fk_user_action'] = (int) $payload['fk_user_assigned'];
            }
            unset($payload['fk_user_assigned']);
        }

        // parseDate returns null for invalid/empty, int otherwise. We apply
        // it BEFORE importMappedData to preserve the legacy semantic where
        // an empty datep/datef value clears the SQL column to null.
        foreach (['datep', 'datef'] as $dateField) {
            if (array_key_exists($dateField, $payload)) {
                $payload[$dateField] = $this->parseDate($payload[$dateField]);
            }
        }

        try {
            $sanitized = $this->getMapper()->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK AgendaController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            // Quirk: setting type_code resets type_id so ActionComm::update()
            // re-resolves the type by code (cf actioncomm.class.php:1162-1167).
            if ($field === 'type_code') {
                $event->type_code = $value;
                $event->type_id = 0;
                continue;
            }
            $event->$field = $value;
        }

        $result = $event->update($user);
        if ($result < 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors) ? implode('; ', $event->errors) : (string) $event->error;
            dol_syslog('DPK AgendaController::update update() failed: '.$errMsg, LOG_ERR);
            return [['error' => 'Failed to update event: '.$errMsg], 500];
        }

        $event->fetch($eventId);
        $event->fetch_optionals();

        return [$this->formatEvent($event, $this->getMapper(), true), 200];
    }

    /**
     * Mark an agenda event as done (percentage = 100, status = EVENT_FINISHED).
     *
     * @param array|null $arr Route parameters (id)
     * @return array [data, httpCode]
     */
    public function done($arr = null)
    {
        global $db, $user;

        if (empty($arr['id'])) {
            dol_syslog('DPK AgendaController::done missing id parameter', LOG_WARNING);
            return [['error' => 'Event id is required'], 400];
        }

        $eventId = (int) $arr['id'];
        $event = new ActionComm($db);
        $result = $event->fetch($eventId);
        if ($result <= 0) {
            dol_syslog('DPK AgendaController::done event '.$eventId.' not found', LOG_WARNING);
            return [['error' => 'Event not found'], 404];
        }

        if (!$this->canEditEvent($event, $user)) {
            dol_syslog('DPK AgendaController::done user '.$user->id.' denied edit on event '.$eventId, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $event->percentage = 100;
        $event->status = ActionComm::EVENT_FINISHED;

        $result = $event->update($user);
        if ($result < 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors) ? implode('; ', $event->errors) : (string) $event->error;
            dol_syslog('DPK AgendaController::done update() failed: '.$errMsg, LOG_ERR);
            return [['error' => 'Failed to mark event done: '.$errMsg], 500];
        }

        $event->fetch($eventId);
        $event->fetch_optionals();

        return [$this->formatEvent($event, $this->getMapper(), true), 200];
    }

    /**
     * Delete an agenda event.
     *
     * @param array|null $arr Route parameters (id)
     * @return array [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (empty($arr['id'])) {
            dol_syslog('DPK AgendaController::delete missing id parameter', LOG_WARNING);
            return [['error' => 'Event id is required'], 400];
        }

        if (!$user->hasRight('agenda', 'myactions', 'delete')) {
            dol_syslog('DPK AgendaController::delete denied: missing agenda.myactions.delete for user '.$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $eventId = (int) $arr['id'];
        $event = new ActionComm($db);
        $result = $event->fetch($eventId);
        if ($result <= 0) {
            dol_syslog('DPK AgendaController::delete event '.$eventId.' not found', LOG_WARNING);
            return [['error' => 'Event not found'], 404];
        }

        if (!$this->canEditEvent($event, $user)) {
            dol_syslog('DPK AgendaController::delete user '.$user->id.' denied delete on event '.$eventId, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $result = $event->delete($user);
        if ($result < 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors) ? implode('; ', $event->errors) : (string) $event->error;
            dol_syslog('DPK AgendaController::delete delete() failed: '.$errMsg, LOG_ERR);
            return [['error' => 'Failed to delete event: '.$errMsg], 500];
        }

        return [['message' => 'Event deleted'], 200];
    }

    /**
     * Determine if the current user may read an event.
     *
     * @param ActionComm $event
     * @param object     $user
     * @return bool
     */
    private function canAccessEvent($event, $user)
    {
        if ($user->admin) {
            return true;
        }
        if ($user->hasRight('agenda', 'allactions', 'read')) {
            return true;
        }
        if ((int) $event->userownerid === (int) $user->id) {
            return true;
        }
        // Check assigned users via resources table when available
        if (is_array($event->userassigned ?? null)) {
            foreach ($event->userassigned as $key => $val) {
                $candidate = is_array($val) && isset($val['id']) ? (int) $val['id'] : (int) $key;
                if ($candidate === (int) $user->id) {
                    return true;
                }
            }
        }
        return $user->hasRight('agenda', 'myactions', 'read') && (int) $event->userownerid === (int) $user->id;
    }

    /**
     * Determine if the current user may edit/delete an event.
     *
     * @param ActionComm $event
     * @param object     $user
     * @return bool
     */
    private function canEditEvent($event, $user)
    {
        if ($user->admin) {
            return true;
        }
        if ($user->hasRight('agenda', 'allactions', 'create')) {
            return true;
        }
        if (!$user->hasRight('agenda', 'myactions', 'create')) {
            return false;
        }
        return (int) $event->userownerid === (int) $user->id;
    }

    /**
     * Parse a date input that can either be a unix timestamp or an ISO string.
     *
     * @param mixed $value
     * @return int|null Unix timestamp, or null if value cannot be parsed
     */
    private function parseDate($value)
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        $ts = strtotime((string) $value);
        return $ts !== false ? $ts : null;
    }

    /**
     * Format an ActionComm for JSON output.
     *
     * @param ActionComm $event
     * @param dmAgenda   $mapper
     * @param bool       $detailed Include relationship arrays (assigned users)
     * @return array
     */
    private function formatEvent($event, $mapper, $detailed = false)
    {
        // exportMappedData returns a stdClass; cast to array so the
        // ActionComm-specific reshape below (which uses array syntax)
        // works on every PHP version (PHP 8.2 strict mode otherwise
        // raises "Cannot use object of type stdClass as array").
        $data = (array) $mapper->exportMappedData($event);

        // Re-shape ActionComm-specific fields that the mapper cannot infer.
        $data['id'] = (int) $event->id;
        $data['ref'] = $event->ref;
        $data['label'] = (string) $event->label;
        $data['type_code'] = (string) $event->type_code;
        $data['datep'] = $event->datep ? (int) $event->datep : null;
        $data['datef'] = $event->datef ? (int) $event->datef : null;
        $data['percentage'] = (int) ($event->percentage ?? 0);
        $data['location'] = (string) ($event->location ?? '');
        $data['fulldayevent'] = !empty($event->fulldayevent) ? 1 : 0;
        $data['note'] = (string) ($event->note_private ?? '');
        $data['fk_user_action'] = (int) ($event->userownerid ?? 0);
        $data['fk_user_assigned'] = (int) ($event->userownerid ?? 0);
        $data['socid'] = !empty($event->socid) ? (int) $event->socid : null;
        $data['fk_soc'] = !empty($event->socid) ? (int) $event->socid : null;
        $data['fk_contact'] = !empty($event->contact_id) ? (int) $event->contact_id : null;
        $data['fk_element'] = !empty($event->fk_element) ? (int) $event->fk_element : null;
        $data['elementtype'] = (string) ($event->elementtype ?? '');
        $data['status'] = (int) ($event->status ?? 0);
        // Delta-sync watermark. ActionComm::fetch() exposes the tms column as
        // $datem (already a unix timestamp). Emitting it lets the client patch
        // its cache and advance its `since` cursor after a mutation.
        $data['tms'] = !empty($event->datem) ? (int) $event->datem : null;

        if ($detailed && is_array($event->userassigned ?? null)) {
            $assigned = [];
            foreach ($event->userassigned as $key => $val) {
                $candidate = is_array($val) && isset($val['id']) ? (int) $val['id'] : (int) $key;
                if ($candidate > 0) {
                    $assigned[] = $candidate;
                }
            }
            $data['assigned_user_ids'] = $assigned;
        }

        return $data;
    }
}
