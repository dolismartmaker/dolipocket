<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\InvoiceController;

/**
 * Integration tests for the DataTable v2 column catalog endpoint.
 *
 * Covers:
 *  - GET /invoice/columns returns 200 + an array of column descriptors.
 *  - Each entry carries the v2 contract keys.
 *  - The catalog exposes the canonical "ref" column from dmInvoice.
 *  - The catalog excludes the "entity" system field.
 */
class InvoiceColumnsTest extends DolibarrRealTestCase
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
        $this->assertArrayHasKey('ref', $byKey, 'invoice catalog must expose the ref column');
        $this->assertSame('main', $byKey['ref']['group']);
    }

    public function testCatalogExcludesSystemFields(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayNotHasKey('entity', $byKey);
    }
}
