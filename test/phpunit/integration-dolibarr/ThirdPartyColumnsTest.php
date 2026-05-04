<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;

/**
 * Integration tests for the DataTable v2 column catalog endpoint.
 *
 * Covers (cf docs/DATATABLE_SPEC.md §13):
 *  - GET /thirdparty/columns returns an array of normalised column descriptions.
 *  - Each entry has the keys expected by the front-end DataTable.
 *  - The catalog contains the well-known field "name" (group=main, sortable).
 *  - The catalog excludes hidden / system fields (no entry for "entity").
 */
class ThirdPartyColumnsTest extends DolibarrRealTestCase
{
    /** @var ThirdPartyController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['societe'] = 'societe';
        if (!isset($conf->societe)) {
            $conf->societe = new \stdClass();
        }
        $conf->societe->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->societe)) {
            $user->rights->societe = new \stdClass();
        }
        $user->rights->societe->lire = 1;

        $this->controller = new ThirdPartyController();
    }

    public function testColumnsReturnsArrayOfDescriptors(): void
    {
        [$data, $code] = $this->controller->columns(null);

        $this->assertSame(200, $code, 'columns endpoint must return 200');
        $this->assertIsArray($data, 'columns must return an array');
        $this->assertNotEmpty($data, 'catalog must not be empty');

        // Each entry has the v2 contract keys.
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

    public function testCatalogContainsNameColumn(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayHasKey('name', $byKey, 'catalog must expose the name column');
        $this->assertSame('main', $byKey['name']['group']);
        $this->assertTrue((bool) $byKey['name']['sortable']);
    }

    public function testCatalogExcludesSystemFields(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        // entity is a system column managed by Dolibarr itself, never user-facing.
        $this->assertArrayNotHasKey('entity', $byKey);
    }
}
