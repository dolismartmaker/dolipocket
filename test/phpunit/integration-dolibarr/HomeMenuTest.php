<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\HomeController;

/**
 * Integration tests for the adaptive PWA menu and CRUD permission map
 * exposed by GET /home (Dolipocket\Api\HomeController::index).
 *
 * Covers:
 *  - Response shape: 'menu' (array of sections) and 'permissions' (flat map)
 *  - Right-based filtering: items requiring a missing right are dropped,
 *    sections that become empty disappear entirely
 *  - Admin bypass: admin user sees every section
 *  - Allowlist constant DOLIPOCKET_HOME_MENU_ITEMS:
 *      - empty -> all rights-OK items visible
 *      - CSV   -> only listed ids visible (admin bypass does NOT override)
 */
class HomeMenuTest extends DolibarrRealTestCase
{
    /** @var HomeController */
    private $controller;

    /** @var array<string, mixed> Snapshot of the original $user state to restore in tearDown. */
    private $originalUserState = array();

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        // Load controller + SmartAuth autoload (used by other controllers
        // referenced through PSR-4 autoload, so harmless here but keeps the
        // bootstrap consistent with sibling tests).
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/HomeController.php';

        // Snapshot fields we will mutate so tearDown can restore them. This
        // matters because $user is a global singleton shared with other tests.
        $this->originalUserState = array(
            'admin'  => $user->admin ?? null,
            'rights' => isset($user->rights) ? clone $user->rights : null,
        );

        // Reset the menu allowlist constant before every test (the constant
        // leaks across tests otherwise: a test that sets it would silently
        // restrict the next test).
        $this->setMenuAllowlist('');

        // Make sure the modules touched by the menu are registered so
        // hasRight() does not early-return 0 due to isModEnabled() == false.
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        // Note on naming: Dolibarr's User::hasRight() remaps the module
        // string before the isModEnabled() check (e.g. 'produit' -> 'product').
        // We register both keys so isModEnabled() returns true regardless of
        // the canonical form.
        foreach (
            array(
                'societe',
                'produit',
                'product',
                'stock',
                'propal',
                'commande',
                'facture',
                'fournisseur',
                'agenda',
            ) as $mod
        ) {
            $conf->modules[$mod] = $mod;
            if (!isset($conf->{$mod})) {
                $conf->{$mod} = new \stdClass();
            }
            $conf->{$mod}->enabled = 1;
        }

        $this->controller = new HomeController();
    }

    protected function tearDown(): void
    {
        global $user;

        // Restore the original $user state (admin flag + rights tree).
        if (array_key_exists('admin', $this->originalUserState)) {
            $user->admin = $this->originalUserState['admin'];
        }
        if (array_key_exists('rights', $this->originalUserState) && $this->originalUserState['rights'] !== null) {
            $user->rights = $this->originalUserState['rights'];
        }

        // Reset the constant so subsequent test files start clean.
        $this->setMenuAllowlist('');

        parent::tearDown();
    }

    /**
     * Force the user to admin so every right gate passes. Returns void.
     */
    private function makeUserAdmin(): void
    {
        global $user;
        $user->admin = 1;
        // Ensure $user->rights exists; admin bypass does not strictly require
        // populated rights, but Dolibarr User::hasRight may dereference it.
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
    }

    /**
     * Strip admin and grant only the named Dolibarr rights. Each right is a
     * dotted path like 'societe.lire' or 'fournisseur.commande.lire'.
     *
     * @param array<int,string> $grant Dotted right paths to grant.
     */
    private function makeUserNonAdminWithRights(array $grant): void
    {
        global $user;
        $user->admin = 0;
        $user->rights = new \stdClass();
        foreach ($grant as $path) {
            $segments = explode('.', $path);
            $cursor = $user->rights;
            $last = array_pop($segments);
            foreach ($segments as $seg) {
                if (!isset($cursor->{$seg}) || !is_object($cursor->{$seg})) {
                    $cursor->{$seg} = new \stdClass();
                }
                $cursor = $cursor->{$seg};
            }
            $cursor->{$last} = 1;
        }
    }

    /**
     * Set or clear DOLIPOCKET_HOME_MENU_ITEMS for the current entity.
     */
    private function setMenuAllowlist(string $value): void
    {
        global $conf, $db;
        if ($value === '') {
            dolibarr_del_const($db, 'DOLIPOCKET_HOME_MENU_ITEMS', $conf->entity);
            // Also clear in-memory cache used by getDolGlobalString().
            if (isset($conf->global->DOLIPOCKET_HOME_MENU_ITEMS)) {
                unset($conf->global->DOLIPOCKET_HOME_MENU_ITEMS);
            }
        } else {
            dolibarr_set_const($db, 'DOLIPOCKET_HOME_MENU_ITEMS', $value, 'chaine', 0, '', $conf->entity);
            $conf->global->DOLIPOCKET_HOME_MENU_ITEMS = $value;
        }
    }

    /**
     * Walk the menu sections and collect every item id (flat).
     *
     * @param array $menu
     * @return array<int,string>
     */
    private function collectItemIds(array $menu): array
    {
        $ids = array();
        foreach ($menu as $section) {
            foreach ($section['items'] as $item) {
                $ids[] = $item['id'];
            }
        }
        return $ids;
    }

    public function testIndexReturnsMenuField(): void
    {
        $this->makeUserAdmin();

        list($body, $code) = $this->controller->index(array());

        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('menu', $body, "response must expose 'menu'");
        $this->assertIsArray($body['menu']);
        $this->assertNotEmpty($body['menu'], 'admin user must get at least one menu section');

        // Every section is shaped {title, items[]} with items shaped
        // {id, label, icon, route}.
        foreach ($body['menu'] as $section) {
            $this->assertArrayHasKey('title', $section);
            $this->assertArrayHasKey('items', $section);
            $this->assertIsString($section['title']);
            $this->assertIsArray($section['items']);
            $this->assertNotEmpty($section['items'], 'sections with no visible items must be dropped');
            foreach ($section['items'] as $item) {
                $this->assertArrayHasKey('id', $item);
                $this->assertArrayHasKey('label', $item);
                $this->assertArrayHasKey('icon', $item);
                $this->assertArrayHasKey('route', $item);
                $this->assertArrayNotHasKey('visible', $item, 'visibility closure must not leak in the response');
            }
        }
    }

    public function testIndexReturnsPermissionsField(): void
    {
        $this->makeUserAdmin();

        list($body, $code) = $this->controller->index(array());

        $this->assertSame(200, $code);
        $this->assertArrayHasKey('permissions', $body);
        $this->assertIsArray($body['permissions']);
        $this->assertArrayHasKey('thirdparty.read', $body['permissions']);
        $this->assertArrayHasKey('admin', $body['permissions']);

        // Admin user -> every CRUD slot must be true (except the 'admin' field
        // which reflects the actual flag, here also true).
        $this->assertTrue($body['permissions']['thirdparty.read']);
        $this->assertTrue($body['permissions']['thirdparty.create']);
        $this->assertTrue($body['permissions']['thirdparty.delete']);
        $this->assertTrue($body['permissions']['admin']);
    }

    public function testMenuExcludesItemsWhenUserHasNoRight(): void
    {
        // Non-admin user with only 'home' visible (no rights granted).
        // 'home' has no Dolibarr right gate, 'documents' has none either, so
        // both must remain. Every other item must disappear.
        $this->makeUserNonAdminWithRights(array());

        list($body, $code) = $this->controller->index(array());

        $this->assertSame(200, $code);
        $ids = $this->collectItemIds($body['menu']);
        $this->assertContains('home', $ids, "'home' must be visible without any right");
        $this->assertContains('documents', $ids, "'documents' must be visible without any right");
        $this->assertNotContains('thirdparties', $ids, "'thirdparties' must be hidden when societe.lire is missing");
        $this->assertNotContains('contacts', $ids);
        $this->assertNotContains('proposals', $ids);
        $this->assertNotContains('invoices', $ids);
        $this->assertNotContains('supplier-orders', $ids);
        $this->assertNotContains('agenda', $ids);

        // Permissions must reflect the missing rights.
        $this->assertFalse($body['permissions']['thirdparty.read']);
        $this->assertFalse($body['permissions']['invoice.create']);
        $this->assertFalse($body['permissions']['admin']);
    }

    public function testAdminSeesEverything(): void
    {
        $this->makeUserAdmin();

        list($body) = $this->controller->index(array());

        $ids = $this->collectItemIds($body['menu']);

        // Every defined item must show up.
        $expected = array(
            'home',
            'thirdparties',
            'contacts',
            'proposals',
            'orders',
            'invoices',
            'supplier-orders',
            'supplier-invoices',
            'products',
            'warehouses',
            'stock',
            'agenda',
            'documents',
        );
        foreach ($expected as $id) {
            $this->assertContains($id, $ids, "admin must see '$id'");
        }
    }

    public function testEmptyMenuConfigEnablesAll(): void
    {
        // Explicitly clear the allowlist (also done in setUp for safety).
        $this->setMenuAllowlist('');

        // Non-admin with the rights needed for every gated item.
        $this->makeUserNonAdminWithRights(array(
            'societe.lire',
            'societe.contact.lire',
            'propal.lire',
            'commande.lire',
            'facture.lire',
            'fournisseur.commande.lire',
            'fournisseur.facture.lire',
            'produit.lire',
            'stock.lire',
            'agenda.myactions.read',
        ));

        list($body) = $this->controller->index(array());
        $ids = $this->collectItemIds($body['menu']);

        // All 13 items must be visible because every right is granted and
        // no allowlist is set.
        $expected = array(
            'home',
            'thirdparties',
            'contacts',
            'proposals',
            'orders',
            'invoices',
            'supplier-orders',
            'supplier-invoices',
            'products',
            'warehouses',
            'stock',
            'agenda',
            'documents',
        );
        foreach ($expected as $id) {
            $this->assertContains($id, $ids, "'$id' must be visible when no allowlist is set");
        }
    }

    public function testRestrictedMenuConfigFiltersItems(): void
    {
        // Even an admin must see only the listed ids when the allowlist is set.
        $this->makeUserAdmin();
        $this->setMenuAllowlist('home,thirdparties');

        list($body) = $this->controller->index(array());
        $ids = $this->collectItemIds($body['menu']);

        $this->assertEqualsCanonicalizing(
            array('home', 'thirdparties'),
            $ids,
            'allowlist must restrict the menu strictly to the listed ids'
        );

        // Sections that ended up empty (Sales, Purchase, Catalog, Transverse,
        // Relations except thirdparties) must NOT appear.
        $titles = array_map(function ($s) {
            return $s['title'];
        }, $body['menu']);
        $this->assertCount(2, $body['menu'], 'only Main and Relations sections must remain');
        $this->assertNotEmpty($titles);
    }
}
