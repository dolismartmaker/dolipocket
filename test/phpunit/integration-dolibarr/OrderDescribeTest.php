<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\OrderController;

/**
 * Integration tests for the AutoForm describe endpoint on customer orders.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class OrderDescribeTest extends DolibarrRealTestCase
{
    /** @var OrderController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmOrder.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/OrderController.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['commande'] = 'commande';
        if (!isset($conf->commande)) {
            $conf->commande = new \stdClass();
        }
        $conf->commande->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->commande)) {
            $user->rights->commande = new \stdClass();
        }
        $user->rights->commande->lire = 1;

        $this->controller = new OrderController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedOrderFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        $this->assertArrayHasKey('ref', $vars);
        $this->assertArrayHasKey('fk_soc', $vars);
        $this->assertArrayHasKey('total_ht', $vars);
    }

    public function testDescribeReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->commande->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
