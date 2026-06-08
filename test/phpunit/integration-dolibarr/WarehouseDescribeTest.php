<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\WarehouseController;

/**
 * Integration tests for the AutoForm describe endpoint on warehouses.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class WarehouseDescribeTest extends DolibarrRealTestCase
{
    /** @var WarehouseController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmWarehouse.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/WarehouseController.php';
        require_once DOL_DOCUMENT_ROOT . '/product/stock/class/entrepot.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['stock'] = 'stock';
        if (!isset($conf->stock)) {
            $conf->stock = new \stdClass();
        }
        $conf->stock->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->stock)) {
            $user->rights->stock = new \stdClass();
        }
        $user->rights->stock->lire = 1;

        $this->controller = new WarehouseController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedWarehouseFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        $this->assertArrayHasKey('ref', $vars);
        $this->assertArrayHasKey('label', $vars);
        $this->assertArrayHasKey('lieu', $vars);
    }

    public function testDescribeReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->stock->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
