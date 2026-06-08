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

use Project;

/**
 * Read-only Project lookup controller used by the AutoForm <FkPicker> to
 * resolve `fk_projet` references on devis/commandes/factures (Lot 9).
 *
 * Routes (handled in pwa/api.php):
 *   GET  project              -> index   (paginated list with ?search=)
 *   GET  project/{id}         -> show
 *
 * No create/update/delete: project management is out of Dolipocket's MVP
 * scope. This is a thin wrapper around the projet table to power the FK
 * picker only.
 */
class ProjectController
{
    /**
     * GET /project
     *
     * Paginated index: supports ?search=<text>, ?page=, ?limit=. Returns the
     * envelope shape consumed by <FkPicker>: {items, total, page, limit}.
     *
     * @param  array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog('DPK ProjectController::index forbidden user=' . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;
        $search = isset($arr['search']) ? trim((string) $arr['search']) : '';

        $where = ' WHERE p.entity IN (' . getEntity('project') . ')';
        if ($search !== '') {
            $like = "%" . $db->escape($search) . "%";
            $where .= " AND (p.ref LIKE '" . $like . "' OR p.title LIKE '" . $like . "')";
        }

        $countSql = 'SELECT COUNT(p.rowid) as nb FROM ' . MAIN_DB_PREFIX . 'projet as p' . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog('DPK ProjectController::index count SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $sql = 'SELECT p.rowid, p.ref, p.title, p.fk_soc, p.fk_statut as statut'
            . ' FROM ' . MAIN_DB_PREFIX . 'projet as p' . $where
            . ' ORDER BY p.dateo DESC, p.rowid DESC'
            . $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK ProjectController::index page SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $items[] = [
                'id'     => (int) $obj->rowid,
                'ref'    => (string) $obj->ref,
                'title'  => (string) $obj->title,
                'label'  => trim(((string) $obj->ref) . ' - ' . ((string) $obj->title)),
                'fkSoc'  => (int) $obj->fk_soc,
                'statut' => (int) $obj->statut,
            ];
        }
        $db->free($resql);

        return [
            ['items' => $items, 'total' => $total, 'page' => $page, 'limit' => $limit],
            200,
        ];
    }

    /**
     * GET /project/{id}
     *
     * @param  array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('projet', 'lire')) {
            dol_syslog('DPK ProjectController::show forbidden user=' . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog('DPK ProjectController::show missing id', LOG_WARNING);
            return [['error' => 'Project id is required'], 400];
        }

        $project = new Project($db);
        if ($project->fetch($id) <= 0) {
            dol_syslog('DPK ProjectController::show not found id=' . $id, LOG_WARNING);
            return [['error' => 'Project not found'], 404];
        }

        return [
            [
                'id'    => (int) $project->id,
                'ref'   => (string) $project->ref,
                'title' => (string) $project->title,
                'label' => trim(((string) $project->ref) . ' - ' . ((string) $project->title)),
                'fkSoc' => (int) $project->socid,
                'statut' => (int) $project->statut,
            ],
            200,
        ];
    }
}
