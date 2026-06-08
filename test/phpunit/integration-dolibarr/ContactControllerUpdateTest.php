<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ContactController;

/**
 * Characterization tests for ContactController::update($arr).
 *
 * Freezes the contract of the current implementation (applyPayload +
 * applyExtrafields helpers) before its Phase 2 refactor (cf
 * SPEC_C_DOLIPOCKET_CONTACT.md).
 *
 * Quirks documented:
 *  - civility (API) -> $c->civility_code + $c->civility_id (legacy).
 *  - fk_soc (API)   -> $c->socid + $c->fk_soc (double assignment).
 *  - Auth check is hasRight('societe','contact','creer') OR
 *    hasRight('societe','creer'). The 403 test revokes BOTH.
 */
class ContactControllerUpdateTest extends DolibarrRealTestCase
{
    /** @var int Pivot company seeded once for the suite. */
    private static $socId;

    /** @var int Secondary company for fk_soc swap tests. */
    private static $socId2;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmContact.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ContactController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/contact/class/contact.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'ContactUpdate-' . uniqid();
            $soc->client = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }
        if (self::$socId2 === null) {
            $soc = new \Societe($db);
            $soc->name = 'ContactUpdateAlt-' . uniqid();
            $soc->client = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe alt failed: ' . $soc->error);
            }
            self::$socId2 = (int) $r;
        }
    }

    private function createContact(): \Contact
    {
        global $db, $user;

        $c = new \Contact($db);
        $c->lastname = 'Seed-' . uniqid();
        $c->firstname = 'Test';
        $c->socid = self::$socId;
        $c->fk_soc = self::$socId;
        $c->statut = 1;
        $r = $c->create($user);
        if ($r <= 0) {
            $this->fail('createContact failed: ' . $c->error);
        }
        $c->fetch($r);
        return $c;
    }

    private function reload(int $id): \Contact
    {
        global $db;
        $c = new \Contact($db);
        $c->fetch($id);
        return $c;
    }

    // ---------- Nominal cases ----------

    public function testUpdateNames(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update([
            'id' => $c->id,
            'lastname' => 'Doe',
            'firstname' => 'John',
        ]);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $reloaded = $this->reload($c->id);
        $this->assertSame('Doe', $reloaded->lastname);
        $this->assertSame('John', $reloaded->firstname);
    }

    public function testUpdateAddressBundle(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update([
            'id'      => $c->id,
            'address' => '1 rue de la paix',
            'zip'     => '75001',
            'town'    => 'Paris',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($c->id);
        $this->assertSame('1 rue de la paix', $reloaded->address);
        $this->assertSame('75001', $reloaded->zip);
        $this->assertSame('Paris', $reloaded->town);
    }

    public function testUpdateContactBundle(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update([
            'id'           => $c->id,
            'phone_pro'    => '+33123456789',
            'phone_mobile' => '+33612345678',
            'email'        => 'jane@example.com',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($c->id);
        $this->assertSame('+33123456789', $reloaded->phone_pro);
        $this->assertSame('+33612345678', $reloaded->phone_mobile);
        $this->assertSame('jane@example.com', $reloaded->email);
    }

    public function testUpdateCivility(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update(['id' => $c->id, 'civility' => 'MR']);
        $this->assertSame(200, $code);

        $this->assertSame('MR', $this->reload($c->id)->civility_code);
    }

    public function testUpdateFkSoc(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update(['id' => $c->id, 'fk_soc' => self::$socId2]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($c->id);
        $this->assertSame(self::$socId2, (int) $reloaded->socid);
    }

    public function testUpdateStatut(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update(['id' => $c->id, 'statut' => 0]);
        $this->assertSame(200, $code);

        $this->assertSame(0, (int) $this->reload($c->id)->statut);
    }

    public function testUpdatePosteAndNotes(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update([
            'id'           => $c->id,
            'poste'        => 'CEO',
            'note_public'  => 'pub',
            'note_private' => 'priv',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($c->id);
        $this->assertSame('CEO', $reloaded->poste);
        $this->assertSame('pub', $reloaded->note_public);
        $this->assertSame('priv', $reloaded->note_private);
    }

    /**
     * Mixed payload guard: native fields apply, options_* keys do not
     * crash even when no extrafield is configured in the BDD.
     */
    public function testUpdateMixedNativeAndOptions(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [, $code] = $controller->update([
            'id'                 => $c->id,
            'lastname'           => 'Mixed',
            'options_some_field' => 'whatever',
        ]);
        $this->assertSame(200, $code);

        $this->assertSame('Mixed', $this->reload($c->id)->lastname);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WhenAllRightsRevoked(): void
    {
        global $user;
        $c = $this->createContact();
        $controller = new ContactController();

        $user->rights->societe->creer = 0;
        $user->rights->societe->contact->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $c->id, 'lastname' => 'X']);
        } finally {
            $user->rights->societe->creer = 1;
            $user->rights->societe->contact->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new ContactController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Contact id is required', $body['error']);
    }

    public function testUpdateReturns404WhenContactMissing(): void
    {
        $controller = new ContactController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Contact not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable native field is rejected
     * with 400 and the offending key appears in `errors`. The extrafields
     * path (options_*) is unaffected -- it stays on applyExtrafields().
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $c = $this->createContact();
        $originalLast = $c->lastname;
        $controller = new ContactController();

        [$body, $code] = $controller->update(['id' => $c->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
        $this->assertSame($originalLast, $this->reload($c->id)->lastname, 'lastname unchanged');
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsBirthday(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update(['id' => $c->id, 'birthday' => '2026-05-19']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('birthday', $body['errors']);
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update(['id' => $c->id, 'random_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('random_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update([
            'id'        => $c->id,
            'birthday'  => '2026-05-19',
            'middle'    => 'X',
            'foo'       => 'bar',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('birthday', $body['errors']);
        $this->assertArrayHasKey('middle', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update([
            'id'    => $c->id,
            'lines' => [['description' => 'irrelevant for contact', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * Regression guard for the Phase 2 split: a payload that mixes native
     * fields and options_* keys still applies the native fields, even after
     * importMappedData() became strict on the native side.
     */
    public function testUpdateMixedNativeAndExtrafieldsStillPasses(): void
    {
        $c = $this->createContact();
        $controller = new ContactController();

        [$body, $code] = $controller->update([
            'id'                 => $c->id,
            'lastname'           => 'Mixed Test',
            'firstname'          => 'Jane',
            'options_some_field' => 'whatever',
        ]);

        $this->assertSame(200, $code, 'mixed native+options must succeed: ' . json_encode($body));
        $reloaded = $this->reload($c->id);
        $this->assertSame('Mixed Test', $reloaded->lastname);
        $this->assertSame('Jane', $reloaded->firstname);
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'banque'];
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        foreach ($modules as $m) {
            $conf->modules[$m] = $m;
            if (!isset($conf->$m) || !is_object($conf->$m)) {
                $conf->$m = new \stdClass();
            }
            $conf->$m->enabled = 1;
        }

        if (!isset($conf->global) || !is_object($conf->global)) {
            $conf->global = new \stdClass();
        }
        $conf->global->SOCIETE_CODECLIENT_ADDON     = 'mod_codeclient_monkey';
        $conf->global->SOCIETE_CODEFOURNISSEUR_ADDON = 'mod_codefournisseur_panicum';

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
    }
}
