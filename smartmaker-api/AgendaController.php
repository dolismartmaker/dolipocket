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
        $fkUserAssigned = !empty($arr['fk_user_assigned']) ? (int) $arr['fk_user_assigned'] : 0;
        $socid = !empty($arr['socid']) ? (int) $arr['socid'] : 0;
        $q = !empty($arr['q']) ? trim((string) $arr['q']) : '';
        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 100;
        $offset = ($page - 1) * $limit;

        $canSeeAll = $user->hasRight('agenda', 'allactions', 'read');

        $sql = "SELECT DISTINCT t.id";
        $sql .= " FROM ".MAIN_DB_PREFIX."actioncomm AS t";
        // Join resources only when filtering by assigned user
        if ($fkUserAssigned > 0 || !$canSeeAll) {
            $sql .= " LEFT JOIN ".MAIN_DB_PREFIX."actioncomm_resources AS ar";
            $sql .= " ON (ar.fk_actioncomm = t.id AND ar.element_type = 'user')";
        }
        $sql .= " WHERE t.entity IN (".getEntity('agenda').")";

        // Limit visibility to owned/assigned events when allactions.read is missing
        if (!$canSeeAll) {
            $sql .= " AND (t.fk_user_action = ".((int) $user->id);
            $sql .= " OR ar.fk_element = ".((int) $user->id).")";
        }

        if ($fkUserAssigned > 0) {
            $sql .= " AND ar.fk_element = ".((int) $fkUserAssigned);
        }

        if ($socid > 0) {
            $sql .= " AND t.fk_soc = ".((int) $socid);
        }

        if ($start !== null) {
            $sql .= " AND (t.datep2 IS NULL OR t.datep2 >= '".$db->idate($start)."')";
        }
        if ($end !== null) {
            $sql .= " AND t.datep <= '".$db->idate($end)."'";
        }

        if ($q !== '') {
            $escaped = $db->escape($q);
            $sql .= " AND (t.label LIKE '%".$escaped."%' OR t.location LIKE '%".$escaped."%')";
        }

        $sql .= " ORDER BY t.datep ASC, t.id DESC";
        $sql .= $db->plimit($limit, $offset);

        $events = [];
        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK AgendaController::index SQL failed: '.$db->lasterror(), LOG_ERR);
            return [['error' => 'Failed to list events'], 500];
        }

        $mapper = $this->getMapper();
        while ($obj = $db->fetch_object($resql)) {
            $event = new ActionComm($db);
            if ($event->fetch((int) $obj->id) > 0) {
                $event->fetch_optionals();
                $events[] = $this->formatEvent($event, $mapper);
            }
        }
        $db->free($resql);

        return [$events, 200];
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

        $assignedUserId = !empty($arr['fk_user_assigned']) ? (int) $arr['fk_user_assigned'] : (int) $user->id;
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

        if (isset($arr['label'])) {
            $event->label = trim((string) $arr['label']);
        }
        if (isset($arr['type_code'])) {
            $event->type_code = (string) $arr['type_code'];
            // type_id needs reset so create()/update() resolve from type_code
            $event->type_id = 0;
        }
        if (isset($arr['datep'])) {
            $event->datep = !empty($arr['datep']) ? $this->parseDate($arr['datep']) : null;
        }
        if (isset($arr['datef'])) {
            $event->datef = !empty($arr['datef']) ? $this->parseDate($arr['datef']) : null;
        }
        if (isset($arr['fulldayevent'])) {
            $event->fulldayevent = !empty($arr['fulldayevent']) ? 1 : 0;
        }
        if (isset($arr['location'])) {
            $event->location = (string) $arr['location'];
        }
        if (isset($arr['note'])) {
            $event->note_private = (string) $arr['note'];
        }
        if (isset($arr['percentage'])) {
            $event->percentage = (int) $arr['percentage'];
        }
        if (isset($arr['status'])) {
            $event->status = (int) $arr['status'];
        }
        if (isset($arr['socid'])) {
            $event->socid = !empty($arr['socid']) ? (int) $arr['socid'] : 0;
        }
        if (isset($arr['fk_contact'])) {
            $event->contact_id = !empty($arr['fk_contact']) ? (int) $arr['fk_contact'] : 0;
        }
        if (isset($arr['fk_element'])) {
            $event->fk_element = !empty($arr['fk_element']) ? (int) $arr['fk_element'] : 0;
        }
        if (isset($arr['elementtype'])) {
            $event->elementtype = (string) $arr['elementtype'];
        }
        if (!empty($arr['fk_user_assigned'])) {
            $newAssignee = (int) $arr['fk_user_assigned'];
            $event->userownerid = $newAssignee;
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
        $data = $mapper->exportMappedData($event);

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
