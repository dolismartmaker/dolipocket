<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProductController;

/**
 * Integration tests for the AutoForm describe endpoint on products/services.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class ProductDescribeTest extends DolibarrRealTestCase
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
        $conf->modules['product'] = 'product';
        if (!isset($conf->product)) {
            $conf->product = new \stdClass();
        }
        $conf->product->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->produit)) {
            $user->rights->produit = new \stdClass();
        }
        if (!isset($user->rights->service)) {
            $user->rights->service = new \stdClass();
        }
        $user->rights->produit->lire = 1;
        $user->rights->service->lire = 1;

        $this->controller = new ProductController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedProductFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        $this->assertArrayHasKey('ref', $vars);
        $this->assertArrayHasKey('label', $vars);
        $this->assertArrayHasKey('price', $vars);
    }

    public function testDescribeReturns403WhenLireRightsAreMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->produit->lire = 0;
        $user->rights->service->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
