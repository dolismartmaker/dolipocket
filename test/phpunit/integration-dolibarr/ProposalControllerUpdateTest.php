<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProposalController;

/**
 * Characterization tests for ProposalController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before
 * its migration to dmProposal::importMappedData() (Spec C, cf
 * SPEC_C_DOLIPOCKET_PROPOSAL.md). Pattern is identical to Invoice with:
 *  - datep is the customer-facing date duplicated onto $propal->date
 *    AND $propal->datep (same as datef on Facture).
 *  - fin_validite is a single native property.
 *  - fk_cond_reglement / fk_mode_reglement same property-renaming
 *    quirk as Invoice / Order.
 *
 * The testUpdateSilentlyIgnoresUnknownField test captures the LEGACY
 * behaviour (200 + total_ht dropped on the floor). Phase 2 will rewrite
 * it to expect 400 + errors.total_ht.
 */
class ProposalControllerUpdateTest extends DolibarrRealTestCase
{
    /** @var int Pivot thirdparty seeded once for the suite. */
    private static $socId;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/SendEmailTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PdfDownloadTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmProposal.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProposalController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'PropalUpdate-' . uniqid();
            $soc->client = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }
    }

    /**
     * Create a fresh draft proposal via Propal directly so each test
     * isolates update() behaviour from the controller's create().
     */
    private function createDraftProposal(): \Propal
    {
        global $db, $user;

        $propal = new \Propal($db);
        $propal->socid = self::$socId;
        $propal->date = dol_now();
        $propal->datep = $propal->date;
        $propal->duree_validite = 30;
        $r = $propal->create($user);
        if ($r <= 0) {
            $this->fail('createDraftProposal failed: ' . $propal->error);
        }
        $propal->fetch($r);
        return $propal;
    }

    private function reload(int $id): \Propal
    {
        global $db;
        $p = new \Propal($db);
        $p->fetch($id);
        return $p;
    }

    // ---------- Nominal cases (the 7 writable fields + combination) ----------

    public function testUpdateRefClient(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [$body, $code] = $controller->update(['id' => $propal->id, 'ref_client' => 'PROP-REF-42']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('PROP-REF-42', $this->reload($propal->id)->ref_client);
    }

    public function testUpdateDatepAcceptsIsoString(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();
        $expected = strtotime('2026-05-18');

        [, $code] = $controller->update(['id' => $propal->id, 'datep' => '2026-05-18']);
        $this->assertSame(200, $code);

        // Propal::fetch peuple $date (et $datep deprecated) depuis la
        // colonne SQL alias `dp`. Read via $date (non-deprecated).
        $this->assertSame($expected, (int) $this->reload($propal->id)->date);
    }

    public function testUpdateDatepAcceptsSecondsTimestamp(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();
        $expected = 1747526400;

        [, $code] = $controller->update(['id' => $propal->id, 'datep' => $expected]);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($propal->id)->date);
    }

    public function testUpdateFinValidite(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();
        $expected = strtotime('2026-06-30');

        [, $code] = $controller->update(['id' => $propal->id, 'fin_validite' => '2026-06-30']);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($propal->id)->fin_validite);
    }

    public function testUpdateNotes(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [, $code] = $controller->update([
            'id'           => $propal->id,
            'note_public'  => 'propal pub',
            'note_private' => 'propal priv',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($propal->id);
        $this->assertSame('propal pub', $reloaded->note_public);
        $this->assertSame('propal priv', $reloaded->note_private);
    }

    public function testUpdateFkCondReglement(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [, $code] = $controller->update(['id' => $propal->id, 'fk_cond_reglement' => 5]);
        $this->assertSame(200, $code);

        $this->assertSame(5, (int) $this->reload($propal->id)->cond_reglement_id);
    }

    public function testUpdateFkModeReglement(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [, $code] = $controller->update(['id' => $propal->id, 'fk_mode_reglement' => 3]);
        $this->assertSame(200, $code);

        $this->assertSame(3, (int) $this->reload($propal->id)->mode_reglement_id);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();
        $datep = strtotime('2026-05-18');
        $finV = strtotime('2026-06-30');

        [, $code] = $controller->update([
            'id'                => $propal->id,
            'ref_client'        => 'PROP-MULTI',
            'datep'             => '2026-05-18',
            'fin_validite'      => '2026-06-30',
            'note_public'       => 'multi propal',
            'fk_cond_reglement' => 7,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($propal->id);
        $this->assertSame('PROP-MULTI', $reloaded->ref_client);
        $this->assertSame($datep, (int) $reloaded->date);
        $this->assertSame($finV, (int) $reloaded->fin_validite);
        $this->assertSame('multi propal', $reloaded->note_public);
        $this->assertSame(7, (int) $reloaded->cond_reglement_id);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        $user->rights->propal->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $propal->id, 'ref_client' => 'X']);
        } finally {
            $user->rights->propal->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Forbidden', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new ProposalController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Proposal id is required', $body['error']);
    }

    public function testUpdateReturns404WhenProposalMissing(): void
    {
        $controller = new ProposalController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Proposal not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field (total_ht) is now
     * rejected with 400 and the offending key appears in `errors`.
     * importMappedData() strictly enforces writableFields.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $propal = $this->createDraftProposal();
        $originalTotal = (float) $propal->total_ht;
        $controller = new ProposalController();

        [$body, $code] = $controller->update(['id' => $propal->id, 'total_ht' => 1000]);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('total_ht', $body['errors']);
        $this->assertSame(
            $originalTotal,
            (float) $this->reload($propal->id)->total_ht,
            'total_ht must NOT be modified when the call is rejected'
        );
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsStatut(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [$body, $code] = $controller->update(['id' => $propal->id, 'statut' => 1]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertSame(0, (int) $this->reload($propal->id)->statut, 'statut must remain 0 (draft)');
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [$body, $code] = $controller->update(['id' => $propal->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [$body, $code] = $controller->update([
            'id'       => $propal->id,
            'total_ht' => 1000,
            'statut'   => 1,
            'foo'      => 'bar',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('total_ht', $body['errors']);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [$body, $code] = $controller->update([
            'id'    => $propal->id,
            'lines' => [['description' => 'should be rejected', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * The pre-refactor controller had explicit (int) casts on
     * fk_cond_reglement and fk_mode_reglement. Post-refactor,
     * _castInputValue() inside the mapper is responsible for the cast.
     * This test asserts that a stringified integer sent by a JSON client
     * lands as a real int in the persisted row.
     */
    public function testUpdateCastsStringFkAsInt(): void
    {
        $propal = $this->createDraftProposal();
        $controller = new ProposalController();

        [, $code] = $controller->update(['id' => $propal->id, 'fk_cond_reglement' => '5']);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($propal->id);
        $this->assertSame(5, $reloaded->cond_reglement_id, 'string "5" must be cast to int 5');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'propal', 'product', 'produit', 'service', 'banque', 'projet'];
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
        $conf->global->PROPALE_ADDON     = 'mod_propale_saphir';
        $conf->global->PROPALE_ADDON_PDF = 'azur';

        $entity = (int) ($conf->entity ?? 1);
        $tmp = sys_get_temp_dir() . '/dolipocket-proposal-update-test';
        @mkdir($tmp, 0777, true);
        $conf->propal->multidir_output = [$entity => $tmp];
        $conf->propal->dir_output = $tmp;

        foreach ([
            ['societe', 'lire'], ['societe', 'creer'],
            ['propal', 'lire'], ['propal', 'creer'],
        ] as $r) {
            [$obj, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }
}
