<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProposalController;

/**
 * Integration tests for the DataTable v2 lines column catalog endpoint.
 *
 * Covers (cf docs/DATATABLE_SPEC.md section 13):
 *  - GET /proposal/lines/columns returns an array of normalized column descriptors.
 *  - The catalog contains the well-known accounting columns (qty, subprice, tvaTx, totalHt).
 *  - Lines are never sortable/filterable from the UI -> sortable=false, filterable=false everywhere.
 */
class ProposalLinesColumnsTest extends DolibarrRealTestCase
{
    /** @var ProposalController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmProposal.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProposalController.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['propal'] = 'propal';
        if (!isset($conf->propal)) {
            $conf->propal = new \stdClass();
        }
        $conf->propal->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->propal)) {
            $user->rights->propal = new \stdClass();
        }
        $user->rights->propal->lire = 1;

        $this->controller = new ProposalController();
    }

    public function testLinesColumnsReturnsArrayOfDescriptors(): void
    {
        [$data, $code] = $this->controller->linesColumns(null);

        $this->assertSame(200, $code, 'lines/columns endpoint must return 200');
        $this->assertIsArray($data, 'lines/columns must return an array');
        $this->assertNotEmpty($data, 'lines catalog must not be empty');

        // Each entry has the v2 contract keys, identical to getColumnCatalog().
        foreach ($data as $col) {
            $this->assertIsArray($col);
            $this->assertArrayHasKey('key', $col);
            $this->assertArrayHasKey('label', $col);
            $this->assertArrayHasKey('type', $col);
            $this->assertArrayHasKey('sortable', $col);
            $this->assertArrayHasKey('filterable', $col);
            $this->assertArrayHasKey('filterKind', $col);
            $this->assertArrayHasKey('filterOptions', $col);
            $this->assertArrayHasKey('defaultVisible', $col);
            $this->assertArrayHasKey('defaultWidth', $col);
            $this->assertArrayHasKey('group', $col);
            $this->assertArrayHasKey('doliside', $col);
            $this->assertContains($col['group'], ['main', 'extra', 'extrafield']);
        }
    }

    public function testLinesCatalogContainsAccountingColumns(): void
    {
        [$data] = $this->controller->linesColumns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayHasKey('qty', $byKey, 'lines catalog must expose qty');
        $this->assertArrayHasKey('subprice', $byKey, 'lines catalog must expose subprice');
        // dmCatalogTrait::snakeToCamel converts the catalog 'key' (appside)
        // to camelCase so it matches the keys produced by frontend
        // mapFromBackend(). The 'doliside' stays in snake_case for SQL,
        // but tests assert against the camelCase 'key' here.
        $this->assertArrayHasKey('tvaTx', $byKey, 'lines catalog must expose tvaTx');
        $this->assertArrayHasKey('totalHt', $byKey, 'lines catalog must expose totalHt');

        // Spot-check the type heuristics: qty/subprice/totalHt are floats,
        // because they are price-like properties on PropaleLigne.
        $this->assertSame('float', $byKey['qty']['type']);
        $this->assertSame('float', $byKey['subprice']['type']);
        $this->assertSame('float', $byKey['totalHt']['type']);
    }

    public function testAllLinesEntriesHaveSortableAndFilterableFalse(): void
    {
        [$data] = $this->controller->linesColumns(null);

        foreach ($data as $col) {
            $this->assertFalse(
                (bool) $col['sortable'],
                'line column ' . $col['key'] . ' must not be sortable (lines are rendered in their natural order)'
            );
            $this->assertFalse(
                (bool) $col['filterable'],
                'line column ' . $col['key'] . ' must not be filterable from the UI'
            );
        }
    }
}
