<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ContactController;
use Dolipocket\Api\InvoiceController;
use Dolipocket\Api\OrderController;
use Dolipocket\Api\ProductController;
use Dolipocket\Api\ProposalController;
use Dolipocket\Api\SupplierInvoiceController;
use Dolipocket\Api\SupplierOrderController;
use Dolipocket\Api\ThirdPartyController;
use Dolipocket\Api\WarehouseController;

/**
 * SQL-safety regression tests for every paginated index() / count() endpoint
 * exposed by the Dolipocket smartmaker-api.
 *
 * The driving observation: appside keys declared in $listOfPublishedFields
 * are not always backed by a real SQL column on the parent table. Dolibarr
 * sometimes exposes computed properties on its in-memory object (e.g.
 * Societe::$country_code is filled from a JOIN on llx_c_country at fetch
 * time, the SQL column itself is fk_pays). When such an appside key ends up
 * in the dmCatalogTrait::getSearchFields() whitelist, the global ?search=
 * LIKE clause emits "WHERE s.country_code LIKE ..." against llx_societe and
 * the database raises "Unknown column" -- a silent prod failure.
 *
 * This suite forces every paginated controller to:
 *   - run index() with ?search=zzz (must return 200, no DB error)
 *   - run count()  with ?search=zzz (same constraint)
 *
 * If a mapper exposes an appside key without a matching SQL column, the
 * SELECT crashes and the assertion below fails with the offending column
 * name embedded in the controller's error response. Fix the mapper (drop
 * the key from listOfPublishedFields, or override its searchable flag).
 *
 * Cf .claude/CLAUDE.md "Lot 6 v2" + "Lot 9" for the catalog mechanics.
 */
class SearchSqlSafetyTest extends DolibarrRealTestCase
{
    /**
     * Each row: [label, controllerClassName, requiredRights]
     * where requiredRights is a list of [object, method, perm] triples
     * passed to $user->rights->* assignments.
     *
     * @return array<string,array{string,array<int,array{string,?string,string}>}>
     */
    public static function controllerProvider(): array
    {
        return [
            'thirdparty'      => [ThirdPartyController::class,      [['societe', null, 'lire']]],
            'contact'         => [ContactController::class,         [['societe', 'contact', 'lire'], ['societe', null, 'lire']]],
            'product'         => [ProductController::class,         [['produit', null, 'lire'], ['service', null, 'lire']]],
            'warehouse'       => [WarehouseController::class,       [['stock', null, 'lire']]],
            'proposal'        => [ProposalController::class,        [['propal', null, 'lire']]],
            'order'           => [OrderController::class,           [['commande', null, 'lire']]],
            'invoice'         => [InvoiceController::class,         [['facture', null, 'lire']]],
            'supplierorder'   => [SupplierOrderController::class,   [['fournisseur', 'commande', 'lire']]],
            'supplierinvoice' => [SupplierInvoiceController::class, [['fournisseur', 'facture', 'lire']]],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        global $user;

        // Bootstrap module + smartauth + every smartmaker-api file the
        // controllers may need. Pre-loading once here is cheap and avoids
        // each data provider row repeating the same dol_include_once cost.
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';

        foreach ([
            'dmThirdParty', 'dmContact', 'dmProduct', 'dmWarehouse',
            'dmProposal', 'dmOrder', 'dmInvoice', 'dmSupplierOrder', 'dmSupplierInvoice',
        ] as $mapper) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $mapper . '.php';
        }
        foreach ([
            'ThirdPartyController', 'ContactController', 'ProductController', 'WarehouseController',
            'ProposalController', 'OrderController', 'InvoiceController',
            'SupplierOrderController', 'SupplierInvoiceController',
        ] as $controller) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $controller . '.php';
        }

        // Required Dolibarr classes for fetch() during index().
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/contact/class/contact.class.php';
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
        require_once DOL_DOCUMENT_ROOT . '/product/stock/class/entrepot.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
    }

    /**
     * Ensure index() with a global ?search= does not blow up the SQL.
     *
     * @dataProvider controllerProvider
     * @param string $controllerClass
     * @param array $rights
     */
    public function testIndexWithSearchDoesNotCrashSql(string $controllerClass, array $rights): void
    {
        global $user;
        $this->grantRights($rights);

        $controller = new $controllerClass();
        [$data, $code] = $controller->index([
            'search' => 'zzzqqq-unlikely-token',
            'page'   => 1,
            'limit'  => 5,
        ]);

        $this->assertSame(
            200,
            $code,
            'index() with ?search= must not crash. Response: ' . json_encode($data)
        );

        // Paginated envelope: {items, total, page, limit}. We do not assert
        // the items count -- only that the SQL ran cleanly and the search
        // matched zero rows (the unlikely token guarantees no false-positive
        // rows pollute the assertion).
        $this->assertIsArray($data);
        $this->assertArrayHasKey('items', $data);
        $this->assertArrayHasKey('total', $data);
    }

    /**
     * Ensure count() with a global ?search= does not blow up the SQL.
     *
     * @dataProvider controllerProvider
     * @param string $controllerClass
     * @param array $rights
     */
    public function testCountWithSearchDoesNotCrashSql(string $controllerClass, array $rights): void
    {
        global $user;
        $this->grantRights($rights);

        $controller = new $controllerClass();
        [$data, $code] = $controller->count([
            'search' => 'zzzqqq-unlikely-token',
        ]);

        $this->assertSame(
            200,
            $code,
            'count() with ?search= must not crash. Response: ' . json_encode($data)
        );
        $this->assertIsArray($data);
        $this->assertArrayHasKey('total', $data);
    }

    /**
     * Belt and braces: each searchField returned by the mapper catalog must
     * be present in the parent Dolibarr class $fields (or be one of the
     * very few well-known computed columns that we explicitly allow). This
     * catches the same family of bugs at a different layer -- before the
     * SQL is even built -- so the failure message is more actionable
     * ("country_code is not in Societe::\$fields" vs. "Unknown column").
     *
     * @dataProvider controllerProvider
     */
    public function testEverySearchFieldHasASqlColumn(string $controllerClass, array $rights): void
    {
        global $user, $db;
        $this->grantRights($rights);

        // Reach the mapper through reflection: every controller in the
        // suite stores it as a private $mapper property set in the ctor.
        $controller = new $controllerClass();
        $refl = new \ReflectionObject($controller);
        if (!$refl->hasProperty('mapper')) {
            $this->markTestSkipped($controllerClass . ' has no $mapper property');
        }
        $prop = $refl->getProperty('mapper');
        $prop->setAccessible(true);
        $mapper = $prop->getValue($controller);

        if (!method_exists($mapper, 'getSearchFields')) {
            $this->markTestSkipped(get_class($mapper) . ' does not expose getSearchFields()');
        }

        $searchFields = $mapper->getSearchFields();
        $this->assertIsArray($searchFields);

        $reflMapper = new \ReflectionObject($mapper);
        if (!$reflMapper->hasProperty('dolibarrClassName')) {
            $this->markTestSkipped(get_class($mapper) . ' has no dolibarrClassName');
        }
        $pProp = $reflMapper->getProperty('dolibarrClassName');
        $pProp->setAccessible(true);
        $parentClassName = $pProp->getValue($mapper);

        if (empty($parentClassName) || !class_exists($parentClassName)) {
            $this->markTestSkipped('Dolibarr class ' . $parentClassName . ' missing');
        }

        $parent = new $parentClassName($db);
        $declared = (property_exists($parent, 'fields') && is_array($parent->fields))
            ? array_keys($parent->fields)
            : [];

        foreach ($searchFields as $col) {
            $this->assertContains(
                $col,
                $declared,
                'getSearchFields() returned "' . $col . '" but '
                . $parentClassName . '::$fields does not declare it. '
                . 'The "WHERE alias.' . $col . ' LIKE ..." clause built by '
                . 'PaginatedListTrait will crash with "Unknown column" once '
                . 'a user types in the global search box. Either drop the '
                . 'key from listOfPublishedFields, or expose it in $fields, '
                . 'or override getSearchFields() to filter it out.'
            );
        }
    }

    /**
     * Helper: assign an arbitrary list of $user->rights entries AND force
     * $user->admin = 1. PHPUnit shares $user globally between test classes,
     * so a previous test that flipped admin to 0 (e.g. the *DescribeTest
     * "403 without rights" cases) would leak into this suite. Restoring
     * admin + granting the local lire is the cheapest way to neutralise
     * the leak without coupling this suite to test ordering.
     *
     * @param array $rights list of [obj, sub, perm]
     */
    private function grantRights(array $rights): void
    {
        global $user, $conf;

        $user->admin = 1;

        // Dolibarr's User::hasRight() short-circuits on isModEnabled($module)
        // before looking at $user->rights. Without enabling the modules in
        // $conf, every controller returns 403 regardless of the permission
        // tree. Enable the union of modules touched by this suite plus the
        // few common dependencies (product is exposed under both 'produit'
        // and 'service' depending on the right level).
        $modules = ['societe', 'propal', 'commande', 'facture', 'fournisseur', 'product', 'produit', 'service', 'stock', 'banque', 'projet'];
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        foreach ($modules as $m) {
            $conf->modules[$m] = $m;
            if (!isset($conf->$m) || !is_object($conf->$m)) {
                $conf->$m = new \stdClass();
            }
            $conf->$m->enabled = 1;
        }

        foreach ($rights as $r) {
            [$obj, $sub, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $target = $user->rights->$obj;
            if ($sub !== null) {
                if (!isset($target->$sub)) {
                    $target->$sub = new \stdClass();
                }
                $target = $target->$sub;
            }
            $target->$perm = 1;
        }
    }
}
