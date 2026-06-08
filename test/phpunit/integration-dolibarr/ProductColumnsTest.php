<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProductController;

/**
 * Integration tests for the DataTable v2 column catalog endpoint.
 *
 * Covers (cf docs/DATATABLE_SPEC.md sec 13):
 *  - GET /product/columns returns 200 + an array of normalised column descriptors.
 *  - Each entry carries the v2 contract keys (key/label/type/sortable/...).
 *  - The catalog exposes the canonical "label" column from dmProduct.
 *  - The catalog excludes the "entity" system field.
 */
class ProductColumnsTest extends DolibarrRealTestCase
{
    /** @var ProductController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmProduct.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProductController.php';
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        // hasRight('produit', 'lire') resolves to module 'product' via internal mapping.
        $conf->modules['product'] = 'product';
        $conf->modules['service'] = 'service';
        if (!isset($conf->product)) {
            $conf->product = new \stdClass();
        }
        $conf->product->enabled = 1;
        if (!isset($conf->service)) {
            $conf->service = new \stdClass();
        }
        $conf->service->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->produit)) {
            $user->rights->produit = new \stdClass();
        }
        $user->rights->produit->lire = 1;
        if (!isset($user->rights->service)) {
            $user->rights->service = new \stdClass();
        }
        $user->rights->service->lire = 1;

        $this->controller = new ProductController();
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

    public function testCatalogContainsLabelColumn(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayHasKey('label', $byKey, 'product catalog must expose the label column');
        $this->assertSame('main', $byKey['label']['group']);
    }

    public function testCatalogExcludesSystemFields(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayNotHasKey('entity', $byKey);
    }
}
