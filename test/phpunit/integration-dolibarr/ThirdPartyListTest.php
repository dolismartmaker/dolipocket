<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;
use Societe;

/**
 * Integration tests for the DataTable backend pipeline on the ThirdParty
 * (Societe) controller.
 *
 * Covers (cf docs/DATATABLE_SPEC.md):
 *  - GET without params returns the legacy raw envelope (backward compat).
 *  - GET with page/limit returns the {items,total,page,limit} envelope.
 *  - GET /count returns {total: N}.
 *  - filter[col] correctly narrows the result set.
 *  - sort/order correctly orders the result set.
 *  - DELETE bulk returns {success, errors} and actually deletes.
 */
class ThirdPartyListTest extends DolibarrRealTestCase
{
    /** @var ThirdPartyController */
    private $controller;

    /** @var array<int,int> Ids of fixture rows created in setUp() so tearDown() can wipe them. */
    private $fixtureIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        // Make sure the controller and the Societe class are loaded.
        // SmartAuth dmBase + dmTrait must be loaded before the dm* classes which extend dmBase.
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        // Force admin rights so hasRight() does not 403 the controller paths.
        // Dolibarr's User::hasRight() also early-returns 0 if isModEnabled()
        // is false, so make sure 'societe' is registered in $conf->modules.
        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['societe'] = 'societe';
        if (!isset($conf->societe)) {
            $conf->societe = new \stdClass();
        }
        $conf->societe->enabled = 1;
        if (method_exists($user, 'getrights')) {
            @$user->getrights('societe');
        }
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->societe)) {
            $user->rights->societe = new \stdClass();
        }
        $user->rights->societe->lire = 1;
        $user->rights->societe->creer = 1;
        $user->rights->societe->supprimer = 1;
        if (!isset($user->rights->societe->contact)) {
            $user->rights->societe->contact = new \stdClass();
        }
        $user->rights->societe->contact->lire = 1;
        $user->rights->societe->contact->creer = 1;
        $user->rights->societe->contact->supprimer = 1;

        $this->controller = new ThirdPartyController();

        // Seed fixtures: three predictable third parties for filter/sort tests.
        $this->fixtureIds[] = $this->createThirdParty([
            'name'         => 'DataTable AAA',
            'town'         => 'Paris',
            'email'        => 'aaa@example.test',
            'client'       => 1,
            'fournisseur'  => 0,
        ]);
        $this->fixtureIds[] = $this->createThirdParty([
            'name'         => 'DataTable BBB',
            'town'         => 'Lyon',
            'email'        => 'bbb@example.test',
            'client'       => 1,
            'fournisseur'  => 0,
        ]);
        $this->fixtureIds[] = $this->createThirdParty([
            'name'         => 'DataTable CCC',
            'town'         => 'Lyon',
            'email'        => 'ccc@example.test',
            'client'       => 0,
            'fournisseur'  => 1,
        ]);
    }

    protected function tearDown(): void
    {
        global $user;
        // Best-effort cleanup so subsequent test runs are repeatable.
        foreach ($this->fixtureIds as $id) {
            $tp = new Societe($this->db);
            if ($tp->fetch($id) > 0) {
                $tp->delete($id, $user);
            }
        }
        $this->fixtureIds = [];
        parent::tearDown();
    }

    /**
     * Helper: create a third party row directly via the Societe API.
     *
     * @param array<string,mixed> $payload
     * @return int Created row id.
     */
    private function createThirdParty(array $payload): int
    {
        global $user;
        $tp = new Societe($this->db);
        $tp->name = $payload['name'];
        $tp->town = $payload['town'] ?? '';
        $tp->email = $payload['email'] ?? '';
        $tp->client = (int) ($payload['client'] ?? 1);
        $tp->fournisseur = (int) ($payload['fournisseur'] ?? 0);
        $tp->code_client = '';
        $tp->code_fournisseur = '';

        $newId = $tp->create($user);
        $this->assertGreaterThan(0, $newId, 'Fixture create() must succeed: ' . $tp->error);
        return (int) $newId;
    }

    public function testIndexLegacyShapeWhenNoListParams(): void
    {
        list($body, $code) = $this->controller->index([]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        // Legacy envelope: {items, page, limit} -- no 'total' key.
        $this->assertArrayHasKey('items', $body);
        $this->assertArrayHasKey('page', $body);
        $this->assertArrayHasKey('limit', $body);
        $this->assertArrayNotHasKey('total', $body);
    }

    public function testIndexPaginatedShapeWhenListParamsPresent(): void
    {
        list($body, $code) = $this->controller->index(['page' => 1, 'limit' => 50]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('items', $body);
        $this->assertArrayHasKey('total', $body);
        $this->assertArrayHasKey('page', $body);
        $this->assertArrayHasKey('limit', $body);
        $this->assertSame(1, $body['page']);
        $this->assertSame(50, $body['limit']);
        $this->assertGreaterThanOrEqual(3, $body['total']);
    }

    public function testCountReturnsTotal(): void
    {
        list($body, $code) = $this->controller->count([]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('total', $body);
        $this->assertIsInt($body['total']);
        $this->assertGreaterThanOrEqual(3, $body['total']);
    }

    public function testCountWithFilterNarrowsResult(): void
    {
        // Filter by town=Lyon should match BBB + CCC = 2 fixture rows.
        list($body, $code) = $this->controller->count([
            'filter' => ['town' => 'Lyon'],
        ]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('total', $body);
        // We assert >= 2 (other tests / fixture seed could add more) but the
        // fixture rows we created with town=Lyon must all be counted.
        $this->assertGreaterThanOrEqual(2, $body['total']);
    }

    public function testIndexWithFilterReturnsOnlyMatchingRows(): void
    {
        list($body, $code) = $this->controller->index([
            'filter' => ['town' => 'Lyon'],
            'page'   => 1,
            'limit'  => 100,
        ]);
        $this->assertSame(200, $code);
        $this->assertGreaterThanOrEqual(2, $body['total']);
        foreach ($body['items'] as $item) {
            // exportMappedData() returns stdClass; access via property.
            $town = is_object($item) ? ($item->town ?? null) : ($item['town'] ?? null);
            $this->assertSame('Lyon', $town, 'Each returned row must have town=Lyon.');
        }
    }

    public function testIndexWithSortDescOrdersResultDescending(): void
    {
        list($body, $code) = $this->controller->index([
            'filter' => ['name' => 'DataTable'],
            'sort'   => 'name',
            'order'  => 'desc',
            'page'   => 1,
            'limit'  => 10,
        ]);
        $this->assertSame(200, $code);
        $names = array_map(function ($item) {
            return is_object($item) ? ($item->name ?? null) : ($item['name'] ?? null);
        }, $body['items']);
        // Only assert ordering across our fixture trio; other rows might
        // also start with "DataTable" in long-lived seed data.
        $fixtureNames = array_values(array_filter($names, function ($n) {
            return in_array($n, ['DataTable AAA', 'DataTable BBB', 'DataTable CCC'], true);
        }));
        $this->assertSame(['DataTable CCC', 'DataTable BBB', 'DataTable AAA'], $fixtureNames);
    }

    public function testDeleteBulkRemovesRowsAndReportsResult(): void
    {
        // Create two throwaway rows for this test only, NOT registered in
        // $fixtureIds because deleteBulk should remove them itself.
        $id1 = $this->createThirdParty(['name' => 'BulkDel One', 'town' => 'Paris']);
        $id2 = $this->createThirdParty(['name' => 'BulkDel Two', 'town' => 'Paris']);

        list($body, $code) = $this->controller->deleteBulk(['ids' => [$id1, $id2]]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('success', $body);
        $this->assertArrayHasKey('errors', $body);
        // At least one of our throwaway ids must be in 'success'.
        $allReported = array_merge($body['success'], array_column($body['errors'], 'id'));
        $this->assertContains($id1, $allReported);
        $this->assertContains($id2, $allReported);
        // At least one delete must have succeeded.
        $this->assertNotEmpty($body['success'], 'deleteBulk must report at least one success.');

        // Verify a successful row was actually deleted from the database.
        foreach ($body['success'] as $deletedId) {
            $tp = new Societe($this->db);
            $res = $tp->fetch((int) $deletedId);
            $this->assertLessThanOrEqual(0, $res, "Row $deletedId must be gone after deleteBulk.");
        }
    }
}
