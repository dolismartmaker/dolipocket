<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;
use Societe;

/**
 * Integration tests for the thirdparty cockpit endpoint
 * (GET /thirdparty/{id}/cockpit -- 360 synthesis for the desktop fiche).
 *
 * Covers:
 *  - The aggregation payload contract (currency, permissions, counts, ca,
 *    invoicesRecent/Unpaid, contactsRecent, events).
 *  - A freshly created thirdparty yields zeroed counts / empty lists (the raw
 *    SQL -- jdate, plimit, getEntity -- runs without error on the test driver).
 *  - The server permission map mirrors the user rights (block-level gating).
 *  - 403 without societe.lire, 404 for an unknown id, 400 for a missing id.
 */
class ThirdPartyCockpitTest extends DolibarrRealTestCase
{
    /** @var ThirdPartyController */
    private $controller;

    /** @var array<int,int> */
    private $fixtureIds = [];

    /** @var int */
    private $socId = 0;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        // Enable every module the cockpit may read so hasRight() is not
        // short-circuited by isModEnabled().
        foreach (array('societe', 'facture', 'propal', 'commande', 'projet', 'agenda') as $mod) {
            $conf->modules[$mod] = $mod;
            if (!isset($conf->$mod)) {
                $conf->$mod = new \stdClass();
            }
            $conf->$mod->enabled = 1;
        }

        $user->admin = 1;
        $this->grantAllCockpitRights();

        $this->controller = new ThirdPartyController();

        $this->socId = $this->createThirdParty([
            'name'        => 'Cockpit Fixture',
            'town'        => 'Grenoble',
            'email'       => 'cockpit@example.test',
            'client'      => 1,
            'fournisseur' => 1,
        ]);
        $this->fixtureIds[] = $this->socId;
    }

    protected function tearDown(): void
    {
        global $user;
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
     * Set every right the cockpit gates on, so each block is permitted.
     *
     * @return void
     */
    private function grantAllCockpitRights(): void
    {
        global $user;

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

        foreach (array('facture', 'propal', 'commande', 'projet') as $mod) {
            if (!isset($user->rights->$mod)) {
                $user->rights->$mod = new \stdClass();
            }
            $user->rights->$mod->lire = 1;
        }

        if (!isset($user->rights->agenda)) {
            $user->rights->agenda = new \stdClass();
        }
        if (!isset($user->rights->agenda->allactions)) {
            $user->rights->agenda->allactions = new \stdClass();
        }
        $user->rights->agenda->allactions->read = 1;
    }

    /**
     * @param array<string,mixed> $payload
     * @return int
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

    public function testCockpitReturnsAggregationContract(): void
    {
        list($data, $code) = $this->controller->cockpit(['id' => $this->socId]);

        $this->assertSame(200, $code, 'cockpit must return 200');
        $this->assertIsArray($data);

        foreach (
            array(
                'currency', 'permissions', 'counts', 'ca', 'caTotal',
                'invoicesRecent', 'invoicesUnpaid', 'unpaidTotal',
                'contactsRecent', 'events',
            ) as $key
        ) {
            $this->assertArrayHasKey($key, $data, "cockpit payload must carry '$key'");
        }

        $this->assertIsString($data['currency']);
        $this->assertNotSame('', $data['currency']);

        $this->assertIsArray($data['counts']);
        foreach (array('proposals', 'orders', 'invoices', 'contacts', 'projects') as $c) {
            $this->assertArrayHasKey($c, $data['counts']);
            $this->assertIsInt($data['counts'][$c]);
        }

        $this->assertIsArray($data['ca']);
        $this->assertIsArray($data['invoicesRecent']);
        $this->assertIsArray($data['invoicesUnpaid']);
        $this->assertIsArray($data['contactsRecent']);
        $this->assertIsArray($data['events']);
    }

    public function testCockpitZeroStateForFreshThirdparty(): void
    {
        list($data, $code) = $this->controller->cockpit(['id' => $this->socId]);

        $this->assertSame(200, $code);
        // No commercial documents/contacts/events attached yet: the raw SQL must
        // run cleanly and aggregate to nothing.
        $this->assertSame(0, $data['counts']['proposals']);
        $this->assertSame(0, $data['counts']['orders']);
        $this->assertSame(0, $data['counts']['invoices']);
        $this->assertSame(0, $data['counts']['contacts']);
        $this->assertSame(0, $data['counts']['projects']);
        $this->assertSame(array(), $data['ca']);
        $this->assertSame(0.0, (float) $data['caTotal']);
        $this->assertSame(array(), $data['invoicesRecent']);
        $this->assertSame(array(), $data['invoicesUnpaid']);
        $this->assertSame(0.0, (float) $data['unpaidTotal']);
        $this->assertSame(array(), $data['contactsRecent']);
        $this->assertSame(array(), $data['events']);
    }

    public function testCockpitPermissionsReflectRights(): void
    {
        // All rights granted in setUp -> every block permitted.
        list($data) = $this->controller->cockpit(['id' => $this->socId]);
        $this->assertTrue($data['permissions']['invoice']);
        $this->assertTrue($data['permissions']['proposal']);
        $this->assertTrue($data['permissions']['order']);
        $this->assertTrue($data['permissions']['contact']);
        $this->assertTrue($data['permissions']['project']);

        // Revoke propal.lire (non-admin) -> the proposal block becomes
        // forbidden while invoices stay permitted.
        global $user;
        $user->admin = 0;
        $user->rights->propal->lire = 0;

        list($data2, $code2) = $this->controller->cockpit(['id' => $this->socId]);
        $this->assertSame(200, $code2);
        $this->assertFalse($data2['permissions']['proposal']);
        $this->assertTrue($data2['permissions']['invoice']);
        $this->assertSame(0, $data2['counts']['proposals'], 'forbidden block must not be counted');
    }

    public function testCockpitReturns403WithoutSocieteLire(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->societe->lire = 0;

        list($data, $code) = $this->controller->cockpit(['id' => $this->socId]);

        $this->assertSame(403, $code);
        $this->assertIsArray($data);
        $this->assertArrayHasKey('error', $data);
    }

    public function testCockpitReturns404ForUnknownId(): void
    {
        list($data, $code) = $this->controller->cockpit(['id' => 99999999]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testCockpitReturns400WhenIdMissing(): void
    {
        list($data, $code) = $this->controller->cockpit([]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
