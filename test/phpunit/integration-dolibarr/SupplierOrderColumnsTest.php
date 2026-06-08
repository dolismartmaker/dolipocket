<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\SupplierOrderController;

/**
 * Integration tests for the DataTable v2 column catalog endpoint.
 *
 * Covers:
 *  - GET /supplierorder/columns returns 200 + an array of column descriptors.
 *  - Each entry carries the v2 contract keys.
 *  - The catalog exposes the canonical "ref" column from dmSupplierOrder.
 *  - The catalog excludes the "entity" system field.
 */
class SupplierOrderColumnsTest extends DolibarrRealTestCase
{
    /** @var SupplierOrderController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmSupplierOrder.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/SupplierOrderController.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        // hasRight('fournisseur', 'commande', 'lire') checks $conf->modules['fournisseur'].
        $conf->modules['fournisseur'] = 'fournisseur';
        if (!isset($conf->fournisseur)) {
            $conf->fournisseur = new \stdClass();
        }
        $conf->fournisseur->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->fournisseur)) {
            $user->rights->fournisseur = new \stdClass();
        }
        if (!isset($user->rights->fournisseur->commande)) {
            $user->rights->fournisseur->commande = new \stdClass();
        }
        $user->rights->fournisseur->commande->lire = 1;

        $this->controller = new SupplierOrderController();
    }

    public function testColumnsReturnsArrayOfDescriptors(): void
    {
        [$data, $code] = $this->controller->columns(null);

        $this->assertSame(200, $code, 'columns endpoint must return 200');
        $this->assertIsArray($data, 'columns must return an array');
        $this->assertNotEmpty($data, 'catalog must not be empty');

        foreach ($data as $col) {
            $this->assertIsArray($col);
            $this->assertArrayHasKey('key', $col);
            $this->assertArrayHasKey('label', $col);
            $this->assertArrayHasKey('type', $col);
            $this->assertArrayHasKey('sortable', $col);
            $this->assertArrayHasKey('filterable', $col);
            $this->assertArrayHasKey('filterKind', $col);
            $this->assertArrayHasKey('defaultVisible', $col);
            $this->assertArrayHasKey('defaultWidth', $col);
            $this->assertArrayHasKey('group', $col);
            $this->assertContains($col['group'], ['main', 'extra', 'extrafield']);
        }
    }

    public function testCatalogContainsRefColumn(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayHasKey('ref', $byKey, 'supplier order catalog must expose the ref column');
        $this->assertSame('main', $byKey['ref']['group']);
    }

    public function testCatalogExcludesSystemFields(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayNotHasKey('entity', $byKey);
    }
}
