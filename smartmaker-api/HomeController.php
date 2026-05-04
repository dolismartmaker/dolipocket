<?php

/**
 * Copyright (c) 2025 Eric Seigne <eric.seigne@cap-rel.fr>
 * Copyright (c) 2025 Paolo Debaisieux <paolo.debaisieux@cap-rel.fr>
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

require_once DOL_DOCUMENT_ROOT.'/core/class/extrafields.class.php';

//include your "model"
//dol_include_once('/dolipocket/class/xxxxx.class.php');

use DateTime;

class HomeController
{
    /**
     * [sluggify description]
     *
     * @param   [type]  $string  [$string description]
     *
     * @return  [type]           [return description]
     */
    private function sluggify($string)
    {
        return strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $string)));
    }

    /**
     * Get data to build the main home page
     *
     * Returns the legacy dashboard payload plus two additional keys consumed
     * by the PWA shell:
     *  - menu        : sectioned navigation tree filtered by user rights and
     *                  by the optional admin allowlist DOLIPOCKET_HOME_MENU_ITEMS
     *  - permissions : flat map of CRUD booleans the frontend uses to hide
     *                  per-row action buttons (new, delete, etc.)
     *
     * @param   array|null  $arr  Request parameters (currently unused; declared
     *                            with empty schema in actions_dolipocket so
     *                            SmartAuth's generic sanitizer is bypassed)
     *
     * @return  array             [body, statusCode]
     */
    public function index($arr = null)
    {
        dol_syslog("DPK HomeController::index");
        global $db, $user, $langs;
        $langs->loadLangs(array("dolipocket@dolipocket"));

        // Load user rights so hasRight() answers correctly for every feature
        // tested in getMenu() / getPermissions(). Without this, freshly logged
        // users would see an empty menu on the very first call.
        if (method_exists($user, 'getrights')) {
            $user->getrights();
        }

        $menu = $this->getMenu($user);
        $permissions = $this->getPermissions($user);

        $ret = [
            'statusCode'  => 200,
            'generic_message' => "",
            'lastupdate'  => "",
            'home'        => "",
            'menu'        => $menu,
            'permissions' => $permissions,
            // Uncomment to return field metadata from DolibarrMapping
            // 'config' => $this->mapping ? $this->mapping->objectDesc() : null,
        ];
        dol_syslog("DPK HomeController::index json return will be ".json_encode($ret), LOG_DEBUG);
        return ([$ret, 200]);
    }

    /**
     * Build sectioned menu based on user rights.
     *
     * The PWA renders sections in the order returned here. Each item carries
     * a stable id (used by the admin allowlist DOLIPOCKET_HOME_MENU_ITEMS),
     * a translated label, an icon string mapped frontend-side to a React
     * component, and a route path consumed by the PWA router.
     *
     * Items whose Dolibarr right is not granted are dropped. Sections that
     * end up with no items are dropped entirely.
     *
     * If DOLIPOCKET_HOME_MENU_ITEMS is set (CSV of item ids), only ids in
     * that list survive even if the user has the right. Empty constant means
     * "no allowlist" -> rights-based filtering only.
     *
     * @param   \User  $user  Current user object with rights loaded
     * @return  array         Ordered list of {title, items[]} sections
     */
    private function getMenu($user)
    {
        global $langs;

        // Admin allowlist parsing. An empty constant disables filtering.
        $enabledItemsStr = getDolGlobalString('DOLIPOCKET_HOME_MENU_ITEMS', '');
        $enabledItems = array();
        if (!empty($enabledItemsStr)) {
            $enabledItems = array_filter(array_map('trim', explode(',', $enabledItemsStr)));
        }
        $filterMenu = !empty($enabledItems);

        // Admin bypass: every right gate is open, but the admin allowlist
        // (if any) still applies so the operator can shrink the menu for
        // himself too.
        $isAdmin = ((int) $user->admin === 1);

        // Section blueprint: each item declares an explicit visibility test.
        // The 'visible' closure is evaluated once per item, after admin and
        // allowlist short-circuits.
        $sections = array(
            array(
                'title' => $langs->transnoentities('DolipocketMenuMain'),
                'items' => array(
                    array(
                        'id'      => 'home',
                        'label'   => $langs->transnoentities('DolipocketMenuHome'),
                        'icon'    => 'house',
                        'route'   => '/',
                        'visible' => function ($u) {
                            return true;
                        },
                    ),
                ),
            ),
            array(
                'title' => $langs->transnoentities('DolipocketMenuRelations'),
                'items' => array(
                    array(
                        'id'      => 'thirdparties',
                        'label'   => $langs->transnoentities('DolipocketMenuThirdparties'),
                        'icon'    => 'users',
                        'route'   => '/thirdparties',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('societe', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'contacts',
                        'label'   => $langs->transnoentities('DolipocketMenuContacts'),
                        'icon'    => 'id-card',
                        'route'   => '/contacts',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('societe', 'contact', 'lire');
                        },
                    ),
                ),
            ),
            array(
                'title' => $langs->transnoentities('DolipocketMenuSales'),
                'items' => array(
                    array(
                        'id'      => 'proposals',
                        'label'   => $langs->transnoentities('DolipocketMenuProposals'),
                        'icon'    => 'file-lines',
                        'route'   => '/proposals',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('propal', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'orders',
                        'label'   => $langs->transnoentities('DolipocketMenuOrders'),
                        'icon'    => 'cart-shopping',
                        'route'   => '/orders',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('commande', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'invoices',
                        'label'   => $langs->transnoentities('DolipocketMenuInvoices'),
                        'icon'    => 'file-invoice',
                        'route'   => '/invoices',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('facture', 'lire');
                        },
                    ),
                ),
            ),
            array(
                'title' => $langs->transnoentities('DolipocketMenuPurchase'),
                'items' => array(
                    array(
                        'id'      => 'supplier-orders',
                        'label'   => $langs->transnoentities('DolipocketMenuSupplierOrders'),
                        'icon'    => 'truck',
                        'route'   => '/supplier-orders',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('fournisseur', 'commande', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'supplier-invoices',
                        'label'   => $langs->transnoentities('DolipocketMenuSupplierInvoices'),
                        'icon'    => 'file-invoice-dollar',
                        'route'   => '/supplier-invoices',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('fournisseur', 'facture', 'lire');
                        },
                    ),
                ),
            ),
            array(
                'title' => $langs->transnoentities('DolipocketMenuCatalog'),
                'items' => array(
                    array(
                        'id'      => 'products',
                        'label'   => $langs->transnoentities('DolipocketMenuProducts'),
                        'icon'    => 'box-open',
                        'route'   => '/products',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('produit', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'warehouses',
                        'label'   => $langs->transnoentities('DolipocketMenuWarehouses'),
                        'icon'    => 'warehouse',
                        'route'   => '/warehouses',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('stock', 'lire');
                        },
                    ),
                    array(
                        'id'      => 'stock',
                        'label'   => $langs->transnoentities('DolipocketMenuStock'),
                        'icon'    => 'boxes-stacked',
                        'route'   => '/stock',
                        'visible' => function ($u) {
                            return (bool) $u->hasRight('stock', 'lire');
                        },
                    ),
                ),
            ),
            array(
                'title' => $langs->transnoentities('DolipocketMenuTransverse'),
                'items' => array(
                    array(
                        'id'      => 'agenda',
                        'label'   => $langs->transnoentities('DolipocketMenuAgenda'),
                        'icon'    => 'calendar-days',
                        'route'   => '/agenda',
                        'visible' => function ($u) {
                            return (bool) (
                                $u->hasRight('agenda', 'myactions', 'read')
                                || $u->hasRight('agenda', 'allactions', 'read')
                            );
                        },
                    ),
                    array(
                        'id'      => 'documents',
                        'label'   => $langs->transnoentities('DolipocketMenuDocuments'),
                        'icon'    => 'folder-open',
                        'route'   => '/documents',
                        'visible' => function ($u) {
                            return true;
                        },
                    ),
                ),
            ),
        );

        $out = array();
        foreach ($sections as $section) {
            $visibleItems = array();
            foreach ($section['items'] as $item) {
                // Allowlist filter: when set, item id MUST be in the list.
                if ($filterMenu && !in_array($item['id'], $enabledItems, true)) {
                    continue;
                }
                // Right gate: admin bypass, otherwise evaluate the closure.
                $visible = $isAdmin ? true : (bool) $item['visible']($user);
                if (!$visible) {
                    continue;
                }
                // Drop the closure before returning to the API consumer.
                unset($item['visible']);
                $visibleItems[] = $item;
            }
            if (!empty($visibleItems)) {
                $out[] = array(
                    'title' => $section['title'],
                    'items' => $visibleItems,
                );
            }
        }

        return $out;
    }

    /**
     * Build flat CRUD permission map consumed by the PWA to toggle action
     * buttons (new X, delete, etc.). Keys are stable feature.action strings;
     * values are booleans.
     *
     * Admin users get true for every slot, except 'admin' which always
     * reflects the actual admin flag.
     *
     * @param   \User  $user  Current user with rights loaded
     * @return  array         feature.action => bool
     */
    private function getPermissions($user)
    {
        $isAdmin = ((int) $user->admin === 1);

        // Helper: returns true under admin bypass, otherwise queries hasRight.
        $can = function ($module, $a, $b = '', $c = '') use ($user, $isAdmin) {
            if ($isAdmin) {
                return true;
            }
            return (bool) $user->hasRight($module, $a, $b, $c);
        };

        // Agenda 'write' and 'delete' fall back to either myactions or
        // allactions, so an OR is required just like for read.
        $agendaCan = function ($action) use ($user, $isAdmin) {
            if ($isAdmin) {
                return true;
            }
            return (bool) (
                $user->hasRight('agenda', 'myactions', $action)
                || $user->hasRight('agenda', 'allactions', $action)
            );
        };

        return array(
            // Third parties (Societe). 'write' maps to creer in Dolibarr,
            // there is no separate update right.
            'thirdparty.read'        => $can('societe', 'lire'),
            'thirdparty.create'      => $can('societe', 'creer'),
            'thirdparty.write'       => $can('societe', 'creer'),
            'thirdparty.delete'      => $can('societe', 'supprimer'),

            // Contacts (sub-permission of societe).
            'contact.read'           => $can('societe', 'contact', 'lire'),
            'contact.create'         => $can('societe', 'contact', 'creer'),
            'contact.write'          => $can('societe', 'contact', 'creer'),
            'contact.delete'         => $can('societe', 'contact', 'supprimer'),

            // Products / services.
            'product.read'           => $can('produit', 'lire'),
            'product.create'         => $can('produit', 'creer'),
            'product.write'          => $can('produit', 'creer'),
            'product.delete'         => $can('produit', 'supprimer'),

            // Warehouses (entrepot module right is 'stock').
            'warehouse.read'         => $can('stock', 'lire'),
            'warehouse.create'       => $can('stock', 'creer'),
            'warehouse.write'        => $can('stock', 'creer'),
            'warehouse.delete'       => $can('stock', 'supprimer'),

            // Stock movements: read uses stock.lire, create uses
            // stock.mouvement.creer (no separate write/delete in core).
            'stock.read'             => $can('stock', 'lire'),
            'stock.create'           => $can('stock', 'mouvement', 'creer'),

            // Sales cycle.
            'proposal.read'          => $can('propal', 'lire'),
            'proposal.create'        => $can('propal', 'creer'),
            'proposal.write'         => $can('propal', 'creer'),
            'proposal.delete'        => $can('propal', 'supprimer'),

            'order.read'             => $can('commande', 'lire'),
            'order.create'           => $can('commande', 'creer'),
            'order.write'            => $can('commande', 'creer'),
            'order.delete'           => $can('commande', 'supprimer'),

            'invoice.read'           => $can('facture', 'lire'),
            'invoice.create'         => $can('facture', 'creer'),
            'invoice.write'          => $can('facture', 'creer'),
            'invoice.delete'         => $can('facture', 'supprimer'),

            // Purchase cycle (Dolibarr nests rights under fournisseur).
            'supplierorder.read'     => $can('fournisseur', 'commande', 'lire'),
            'supplierorder.create'   => $can('fournisseur', 'commande', 'creer'),
            'supplierorder.write'    => $can('fournisseur', 'commande', 'creer'),
            'supplierorder.delete'   => $can('fournisseur', 'commande', 'supprimer'),

            'supplierinvoice.read'   => $can('fournisseur', 'facture', 'lire'),
            'supplierinvoice.create' => $can('fournisseur', 'facture', 'creer'),
            'supplierinvoice.write'  => $can('fournisseur', 'facture', 'creer'),
            'supplierinvoice.delete' => $can('fournisseur', 'facture', 'supprimer'),

            // Agenda: OR over myactions / allactions for every slot.
            'agenda.read'            => $agendaCan('read'),
            'agenda.create'          => $agendaCan('create'),
            'agenda.write'           => $agendaCan('create'),
            'agenda.delete'          => $agendaCan('delete'),

            // Reflects the real admin flag (NOT bypassed): the PWA may want
            // to show or hide a "settings" tile based on this value.
            'admin'                  => $isAdmin,
        );
    }
}
