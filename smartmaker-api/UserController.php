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

dol_include_once('/user/class/user.class.php');

use User;

/**
 * Read-only User lookup controller used by the AutoForm <FkPicker> to
 * resolve `fk_user_*` references on devis/commandes/factures (Lot 9).
 *
 * Routes (handled in pwa/api.php):
 *   GET  user           -> index   (paginated list, supports ?search=)
 *   GET  user/{id}      -> show
 *
 * No create/update/delete: user provisioning lives in EntityProvisioner +
 * Dolibarr admin UI. This wrapper exists only so AutoForm can show readable
 * names instead of bare numeric ids.
 */
class UserController
{
    /**
     * GET /user
     *
     * @param  array|null $arr
     * @return array
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('user', 'user', 'lire') && !$user->hasRight('user', 'self', 'creer')) {
            dol_syslog('DPK UserController::index forbidden user=' . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;
        $search = isset($arr['search']) ? trim((string) $arr['search']) : '';

        $where = ' WHERE u.entity IN (' . getEntity('user') . ')';
        // Hide disabled accounts from the picker.
        $where .= ' AND u.statut = 1';
        if ($search !== '') {
            $like = "%" . $db->escape($search) . "%";
            $where .= " AND (u.login LIKE '" . $like . "'"
                . " OR u.firstname LIKE '" . $like . "'"
                . " OR u.lastname LIKE '" . $like . "'"
                . " OR u.email LIKE '" . $like . "')";
        }

        $countSql = 'SELECT COUNT(u.rowid) as nb FROM ' . MAIN_DB_PREFIX . 'user as u' . $where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog('DPK UserController::index count SQL error: ' . $db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $sql = 'SELECT u.rowid, u.login, u.firstname, u.lastname, u.email'
            . ' FROM ' . MAIN_DB_PREFIX . 'user as u' . $where
            . ' ORDER BY u.lastname, u.firstname, u.login'
            . $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog('DPK UserController::index page SQL error: ' . $db->lasterror(), LOG_ERR);
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
     * GET /user/{id}
     *
     * @param  array|null $arr
     * @return array
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('user', 'user', 'lire')
            && !$user->hasRight('user', 'self', 'creer')
            && (int) $user->id !== (isset($arr['id']) ? (int) $arr['id'] : 0)
        ) {
            dol_syslog('DPK UserController::show forbidden user=' . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog('DPK UserController::show missing id', LOG_WARNING);
            return [['error' => 'User id is required'], 400];
        }

        $u = new User($db);
        if ($u->fetch($id) <= 0) {
            dol_syslog('DPK UserController::show not found id=' . $id, LOG_WARNING);
            return [['error' => 'User not found'], 404];
        }

        return [$this->shape($u), 200];
    }

    /**
     * Normalise the {id, login, firstname, lastname, email, fullname, label}
     * shape that the FkPicker expects.
     *
     * @param  object $u Either a stdClass row or a User instance.
     * @return array
     */
    private function shape($u)
    {
        $first = (string) ($u->firstname ?? '');
        $last = (string) ($u->lastname ?? '');
        $login = (string) ($u->login ?? '');
        $fullname = trim(($first . ' ' . $last));
        if ($fullname === '') {
            $fullname = $login;
        }
        return [
            'id'        => (int) ($u->rowid ?? $u->id ?? 0),
            'login'     => $login,
            'firstname' => $first,
            'lastname'  => $last,
            'email'     => (string) ($u->email ?? ''),
            'fullname'  => $fullname,
            'label'     => $login !== '' ? trim($fullname . ' (' . $login . ')') : $fullname,
        ];
    }
}
