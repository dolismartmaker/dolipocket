<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;

/**
 * Characterization tests for ThirdPartyController::update($arr).
 *
 * Freezes the contract of the current implementation (applyPayload +
 * applyExtrafields helpers) before its Phase 2 refactor to
 * dmThirdParty::importMappedData() for native fields, while keeping
 * applyExtrafields() in place for the options_* keys (cf
 * SPEC_B_DOLIPOCKET_THIRDPARTY.md).
 *
 * Coverage:
 *  - 7 nominal cases on the writable scalar fields (name, address bundle,
 *    contact bundle, notes, siren, client/fournisseur flags, combination)
 *  - 1 extrafields case (payload containing options_* keys does not crash
 *    even when no extrafield is configured in the SQLite fixture).
 *  - 4 error paths: 403 forbidden, 400 missing id, 404 not found, and
 *    the legacy "unknown field silently ignored" contract (to be flipped
 *    to strict rejection in Phase 2).
 */
class ThirdPartyControllerUpdateTest extends DolibarrRealTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        global $user;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();
    }

    /**
     * Create a fresh thirdparty via Societe directly (not via the
     * controller's create()) so each test isolates update() behaviour.
     */
    private function createThirdparty(): \Societe
    {
        global $db, $user;

        $tp = new \Societe($db);
        $tp->name = 'TPCU-' . uniqid();
        $tp->client = 1;
        $tp->status = 1;
        $r = $tp->create($user);
        if ($r <= 0) {
            $this->fail('createThirdparty failed: ' . $tp->error);
        }
        $tp->fetch($r);
        return $tp;
    }

    private function reload(int $id): \Societe
    {
        global $db;
        $s = new \Societe($db);
        $s->fetch($id);
        return $s;
    }

    // ---------- Nominal cases ----------

    public function testUpdateName(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update(['id' => $tp->id, 'name' => 'Renamed corp']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('Renamed corp', $this->reload($tp->id)->name);
    }

    public function testUpdateAddressBundle(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update([
            'id'      => $tp->id,
            'address' => '1 rue de la paix',
            'zip'     => '75001',
            'town'    => 'Paris',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame('1 rue de la paix', $reloaded->address);
        $this->assertSame('75001', $reloaded->zip);
        $this->assertSame('Paris', $reloaded->town);
    }

    public function testUpdateContactBundle(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        // Societe::update() strips whitespace from phone numbers, so we
        // characterize the post-trim shape (not the raw input).
        [, $code] = $controller->update([
            'id'    => $tp->id,
            'phone' => '+33123456789',
            'email' => 'foo@example.com',
            'url'   => 'https://example.com',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame('+33123456789', $reloaded->phone);
        $this->assertSame('foo@example.com', $reloaded->email);
        $this->assertSame('https://example.com', $reloaded->url);
    }

    public function testUpdateNotes(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update([
            'id'           => $tp->id,
            'note_public'  => 'pub-note',
            'note_private' => 'priv-note',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame('pub-note', $reloaded->note_public);
        $this->assertSame('priv-note', $reloaded->note_private);
    }

    /**
     * siren is duplicated onto $tp->idprof1 AND $tp->siren by applyPayload.
     * Same pattern for siret -> idprof2, ape -> idprof3.
     */
    public function testUpdateSiren(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update(['id' => $tp->id, 'siren' => '123456789']);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame('123456789', $reloaded->idprof1);
    }

    public function testUpdateClientFlags(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update([
            'id'          => $tp->id,
            'client'      => 2,
            'fournisseur' => 1,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame(2, (int) $reloaded->client);
        $this->assertSame(1, (int) $reloaded->fournisseur);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update([
            'id'          => $tp->id,
            'name'        => 'Combo SA',
            'zip'         => '69001',
            'town'        => 'Lyon',
            'email'       => 'combo@example.com',
            'note_public' => 'multi note',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($tp->id);
        $this->assertSame('Combo SA', $reloaded->name);
        $this->assertSame('69001', $reloaded->zip);
        $this->assertSame('Lyon', $reloaded->town);
        $this->assertSame('combo@example.com', $reloaded->email);
        $this->assertSame('multi note', $reloaded->note_public);
    }

    /**
     * A payload containing options_* keys must not crash even when no
     * matching extrafield is configured in the BDD: applyExtrafields()
     * stuffs them in $tp->array_options unconditionally; insertExtraFields()
     * is a no-op when the elementtype has no extrafield rows.
     *
     * Native fields in the same payload must still persist.
     */
    public function testUpdateAcceptsOptionsKeysWithoutCrash(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update([
            'id'                 => $tp->id,
            'name'               => 'WithOptions Corp',
            'options_some_field' => 'whatever',
        ]);
        $this->assertSame(200, $code);

        $this->assertSame('WithOptions Corp', $this->reload($tp->id)->name);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        $user->rights->societe->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $tp->id, 'name' => 'X']);
        } finally {
            $user->rights->societe->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new ThirdPartyController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Thirdparty id is required', $body['error']);
    }

    public function testUpdateReturns404WhenThirdpartyMissing(): void
    {
        $controller = new ThirdPartyController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Thirdparty not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field is now rejected with 400
     * and the offending key appears in `errors`. importMappedData() strictly
     * enforces writableFields on the native payload (options_* keys go to
     * applyExtrafields() and remain unaffected by this check).
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $tp = $this->createThirdparty();
        $originalName = $tp->name;
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update(['id' => $tp->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
        $this->assertSame($originalName, $this->reload($tp->id)->name, 'name unchanged');
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsCapital(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update(['id' => $tp->id, 'capital' => 50000]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('capital', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update([
            'id'         => $tp->id,
            'capital'    => 50000,
            'prefix_comm' => 'X',
            'foo'        => 'bar',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('capital', $body['errors']);
        $this->assertArrayHasKey('prefix_comm', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update([
            'id'    => $tp->id,
            'lines' => [['description' => 'irrelevant for thirdparty', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * Regression guard for the Phase 2 split: a payload that mixes native
     * fields and options_* keys still applies the native fields, even
     * after importMappedData() became strict on the native side. options_*
     * are routed to applyExtrafields() and never reach the mapper, so they
     * must not trigger a 400.
     */
    public function testUpdateMixedNativeAndExtrafieldsStillPasses(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [$body, $code] = $controller->update([
            'id'                 => $tp->id,
            'name'               => 'Mixed Payload SA',
            'zip'                => '13001',
            'options_some_field' => 'whatever',
        ]);

        $this->assertSame(200, $code, 'mixed native+options must succeed: ' . json_encode($body));
        $reloaded = $this->reload($tp->id);
        $this->assertSame('Mixed Payload SA', $reloaded->name);
        $this->assertSame('13001', $reloaded->zip);
    }

    /**
     * The pre-refactor controller had explicit (int) casts on client and
     * fournisseur. Post-refactor, _castInputValue() inside the mapper is
     * responsible for the cast. This test asserts that a stringified
     * integer sent by a JSON client lands as a real int.
     */
    public function testUpdateCastsStringClientFlagAsInt(): void
    {
        $tp = $this->createThirdparty();
        $controller = new ThirdPartyController();

        [, $code] = $controller->update(['id' => $tp->id, 'client' => '2']);
        $this->assertSame(200, $code);

        $this->assertSame(2, $this->reload($tp->id)->client, 'string "2" must be cast to int 2');
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

        foreach ([
            ['societe', 'lire'], ['societe', 'creer'], ['societe', 'supprimer'],
        ] as $r) {
            [$obj, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }
}
