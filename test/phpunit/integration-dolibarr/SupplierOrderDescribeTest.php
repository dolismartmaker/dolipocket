<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\SupplierOrderController;

/**
 * Integration tests for the AutoForm describe endpoint on supplier orders.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class SupplierOrderDescribeTest extends DolibarrRealTestCase
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

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
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

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedSupplierOrderFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        $this->assertArrayHasKey('ref', $vars);
        $this->assertArrayHasKey('fk_soc', $vars);
        $this->assertArrayHasKey('ref_supplier', $vars);
    }

    public function testDescribeReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->fournisseur->commande->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
