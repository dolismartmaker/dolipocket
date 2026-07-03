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

/**
 * Read-only Resource (Dolresource) lookup controller used by the agenda filter
 * bar <FkPicker> to resolve the `resourceid` filter (cf
 * docs/AGENDA_FILTERS_SPEC.md). Dolibarr resources (rooms, equipment...) live in
 * llx_resource and are identified by their `ref`.
 *
 * Routes (handled in pwa/api.php):
 *   GET  resource        -> index   (paginated list, supports ?search=)
 *   GET  resource/{id}   -> show
 *
 * No create/update/delete: resource management stays in the Dolibarr admin UI.
 * A raw SQL read (no Dolresource fetch loop) keeps the picker at one query.
 */
class ResourceController
{
    /**
     * GET /resource
     *
     * @param  array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('resource', 'read')) {
            dol_syslog('DPK ResourceController::index forbidden user=' . ((int) $user->id), LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;
        $search = isset($arr['search']) ? trim((string) $arr['search']) : '';

        $where = ' WHERE t.entity IN (' . getEntity('resource') . ')';
        if ($search !== '') {
            $like = "%" . $db->escape($search) . "%";
            $where .= " AND (t.ref LIKE '" . $like . "' OR t.description LIKE '" . $like . "')";
        }

        $countSql = 'SELECT COUNT(t.rowid) as nb FROM ' . MAIN_DB_PREFIX . 'resource as t' . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog('DPK ResourceController::index count SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $sql = 'SELECT t.rowid, t.ref, t.description'
            . ' FROM ' . MAIN_DB_PREFIX . 'resource as t' . $where
            . ' ORDER BY t.ref'
            . $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK ResourceController::index page SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $items[] = $this->shape($obj);
        }
        $db->free($resql);

        return [
            ['items' => $items, 'total' => $total, 'page' => $page, 'limit' => $limit],
            200,
        ];
    }

    /**
     * GET /resource/{id}
     *
     * @param  array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('resource', 'read')) {
            dol_syslog('DPK ResourceController::show forbidden user=' . ((int) $user->id), LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog('DPK ResourceController::show missing id', LOG_WARNING);
            return [['error' => 'Resource id is required'], 400];
        }

        $sql = 'SELECT t.rowid, t.ref, t.description'
            . ' FROM ' . MAIN_DB_PREFIX . 'resource as t'
            . ' WHERE t.rowid = ' . $id
            . ' AND t.entity IN (' . getEntity('resource') . ')';
        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK ResourceController::show SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $obj = $db->fetch_object($resql);
        $db->free($resql);
        if (!$obj) {
            dol_syslog('DPK ResourceController::show not found id=' . $id, LOG_WARNING);
            return [['error' => 'Resource not found'], 404];
        }

        return [$this->shape($obj), 200];
    }

    /**
     * Normalise the {id, ref, label, description} shape the FkPicker expects.
     *
     * @param  object $r Row from the resource SELECT.
     * @return array
     */
    private function shape($r)
    {
        $ref = (string) ($r->ref ?? '');
        return [
            'id'          => (int) ($r->rowid ?? 0),
            'ref'         => $ref,
            'label'       => $ref !== '' ? $ref : ('#' . (int) ($r->rowid ?? 0)),
            'description' => (string) ($r->description ?? ''),
        ];
    }
}
