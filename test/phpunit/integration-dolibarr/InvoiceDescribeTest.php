<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\InvoiceController;

/**
 * Integration tests for the AutoForm describe endpoint on customer invoices.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class InvoiceDescribeTest extends DolibarrRealTestCase
{
    /** @var InvoiceController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmInvoice.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/InvoiceController.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['facture'] = 'facture';
        if (!isset($conf->facture)) {
            $conf->facture = new \stdClass();
        }
        $conf->facture->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->facture)) {
            $user->rights->facture = new \stdClass();
        }
        $user->rights->facture->lire = 1;

        $this->controller = new InvoiceController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedInvoiceFields(): void
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
        $user->rights->facture->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
