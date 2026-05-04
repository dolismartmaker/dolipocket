<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ContactController;
use Contact;

/**
 * Integration tests for the DataTable backend pipeline on the Contact
 * controller.
 *
 * Same coverage matrix as ThirdPartyListTest (cf docs/DATATABLE_SPEC.md):
 *  - GET without params returns the legacy raw envelope.
 *  - GET with page/limit returns the paginated envelope.
 *  - GET /count returns {total: N}.
 *  - filter[col] narrows the result set.
 *  - sort/order orders the result set.
 *  - DELETE bulk reports {success, errors} and removes successful rows.
 */
class ContactListTest extends DolibarrRealTestCase
{
    /** @var ContactController */
    private $controller;

    /** @var array<int,int> Fixture ids for tearDown(). */
    private $fixtureIds = [];

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        // SmartAuth dmBase + dmTrait must be loaded before dmContact (which extends dmBase).
        // dol_include_once('/smartauth/autoload.php') registers them via SmartAuth's autoloader.
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmContact.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ContactController.php';
        require_once DOL_DOCUMENT_ROOT . '/contact/class/contact.class.php';

        // Force admin rights so hasRight() does not 403 the controller paths.
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

        $this->controller = new ContactController();

        // Three predictable fixtures: shared lastname stem, two in Paris and
        // one in Lyon for filter assertions.
        $this->fixtureIds[] = $this->createContact([
            'lastname'  => 'DTAlpha',
            'firstname' => 'Anna',
            'email'     => 'anna@example.test',
            'town'      => 'Paris',
        ]);
        $this->fixtureIds[] = $this->createContact([
            'lastname'  => 'DTBeta',
            'firstname' => 'Ben',
            'email'     => 'ben@example.test',
            'town'      => 'Paris',
        ]);
        $this->fixtureIds[] = $this->createContact([
            'lastname'  => 'DTGamma',
            'firstname' => 'Carla',
            'email'     => 'carla@example.test',
            'town'      => 'Lyon',
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->fixtureIds as $id) {
            $c = new Contact($this->db);
            if ($c->fetch($id) > 0) {
                $c->delete(0);
            }
        }
        $this->fixtureIds = [];
        parent::tearDown();
    }

    /**
     * Helper: create a Contact via the Dolibarr Contact class.
     *
     * @param array<string,mixed> $payload
     * @return int Created row id.
     */
    private function createContact(array $payload): int
    {
        global $user;
        $c = new Contact($this->db);
        $c->lastname = $payload['lastname'];
        $c->firstname = $payload['firstname'] ?? '';
        $c->email = $payload['email'] ?? '';
        $c->town = $payload['town'] ?? '';

        $newId = $c->create($user);
        $this->assertGreaterThan(0, $newId, 'Fixture Contact::create() must succeed: ' . $c->error);
        return (int) $newId;
    }

    public function testIndexLegacyShapeWhenNoListParams(): void
    {
        list($body, $code) = $this->controller->index([]);
        $this->assertSame(200, $code);
        $this->assertIsArray($body);
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
        list($body, $code) = $this->controller->count([
            'filter' => ['town' => 'Lyon'],
        ]);
        $this->assertSame(200, $code);
        $this->assertGreaterThanOrEqual(1, $body['total']);
    }

    public function testIndexWithFilterReturnsOnlyMatchingRows(): void
    {
        list($body, $code) = $this->controller->index([
            'filter' => ['town' => 'Paris'],
            'page'   => 1,
            'limit'  => 100,
        ]);
        $this->assertSame(200, $code);
        foreach ($body['items'] as $item) {
            $town = is_object($item) ? ($item->town ?? null) : ($item['town'] ?? null);
            $this->assertSame('Paris', $town, 'Each returned row must have town=Paris.');
        }
    }

    public function testIndexWithSortDescOrdersResultDescending(): void
    {
        list($body, $code) = $this->controller->index([
            'filter' => ['lastname' => 'DT'],
            'sort'   => 'lastname',
            'order'  => 'desc',
            'page'   => 1,
            'limit'  => 10,
        ]);
        $this->assertSame(200, $code);
        $lastnames = array_map(function ($item) {
            return is_object($item) ? ($item->lastname ?? null) : ($item['lastname'] ?? null);
        }, $body['items']);
        $fixtureLastnames = array_values(array_filter($lastnames, function ($l) {
            return in_array($l, ['DTAlpha', 'DTBeta', 'DTGamma'], true);
        }));
        $this->assertSame(['DTGamma', 'DTBeta', 'DTAlpha'], $fixtureLastnames);
    }

    public function testDeleteBulkRemovesRowsAndReportsResult(): void
    {
        // Throwaway fixtures NOT in $fixtureIds.
        $id1 = $this->createContact(['lastname' => 'BulkDelOne', 'town' => 'Paris']);
        $id2 = $this->createContact(['lastname' => 'BulkDelTwo', 'town' => 'Paris']);

        list($body, $code) = $this->controller->deleteBulk(['ids' => [$id1, $id2]]);
        $this->assertSame(200, $code);
        $this->assertArrayHasKey('success', $body);
        $this->assertArrayHasKey('errors', $body);

        $allReported = array_merge($body['success'], array_column($body['errors'], 'id'));
        $this->assertContains($id1, $allReported);
        $this->assertContains($id2, $allReported);
        $this->assertNotEmpty($body['success'], 'deleteBulk must report at least one success.');

        foreach ($body['success'] as $deletedId) {
            $c = new Contact($this->db);
            $res = $c->fetch((int) $deletedId);
            $this->assertLessThanOrEqual(0, $res, "Contact $deletedId must be gone after deleteBulk.");
        }
    }
}
