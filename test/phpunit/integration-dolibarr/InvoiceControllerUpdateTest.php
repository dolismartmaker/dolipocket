<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\InvoiceController;

/**
 * Characterization tests for InvoiceController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before it is
 * migrated to dmInvoice::importMappedData() (Spec B Phase 1). Exercises:
 *   - 8 nominal cases on the 7 writable fields and their combination
 *   - 4 error paths: forbidden, missing id, not found, unknown-field-ignored
 *
 * The testUpdateSilentlyIgnoresUnknownField test captures the LEGACY
 * behaviour (200 + total_ht dropped on the floor). Phase 2 will rewrite
 * it to expect 400 + errors.total_ht because importMappedData() strictly
 * rejects fields outside writableFields.
 */
class InvoiceControllerUpdateTest extends DolibarrRealTestCase
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
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaymentTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PdfDownloadTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmInvoice.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/InvoiceController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'InvoiceUpdate-' . uniqid();
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
     * Create a fresh draft invoice via Facture directly (not via the
     * controller's create()) so each test isolates update() behaviour.
     */
    private function createDraftInvoice(): \Facture
    {
        global $db, $user;

        $invoice = new \Facture($db);
        $invoice->socid = self::$socId;
        $invoice->type = \Facture::TYPE_STANDARD;
        $invoice->date = dol_now();
        $invoice->datef = $invoice->date;
        $r = $invoice->create($user);
        if ($r <= 0) {
            $this->fail('createDraftInvoice failed: ' . $invoice->error);
        }
        $invoice->fetch($r);
        return $invoice;
    }

    private function reload(int $id): \Facture
    {
        global $db;
        $f = new \Facture($db);
        $f->fetch($id);
        return $f;
    }

    // ---------- Nominal cases (the 7 writable fields + combination) ----------

    public function testUpdateRefClient(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [$body, $code] = $controller->update(['id' => $invoice->id, 'ref_client' => 'NEW-REF-42']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('NEW-REF-42', $this->reload($invoice->id)->ref_client);
    }

    public function testUpdateDatefAcceptsIsoString(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();
        $expected = strtotime('2026-05-18');

        [, $code] = $controller->update(['id' => $invoice->id, 'datef' => '2026-05-18']);
        $this->assertSame(200, $code);

        // Facture::fetch() peuple $date depuis la colonne SQL `datef` (alias `df`,
        // cf facture.class.php:2207). La propriete $datef n'est PAS rechargee
        // par fetch() -- le quirk "datef + date" du controller est en write only.
        $reloaded = $this->reload($invoice->id);
        $this->assertSame($expected, (int) $reloaded->date, 'date property persisted from SQL `datef`');
    }

    public function testUpdateDatefAcceptsSecondsTimestamp(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();
        $expected = 1747526400;

        [, $code] = $controller->update(['id' => $invoice->id, 'datef' => $expected]);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($invoice->id)->date);
    }

    public function testUpdateDateLimReglement(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();
        $expected = strtotime('2026-06-30');

        [, $code] = $controller->update(['id' => $invoice->id, 'date_lim_reglement' => '2026-06-30']);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($invoice->id)->date_lim_reglement);
    }

    public function testUpdateNotes(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [, $code] = $controller->update([
            'id'           => $invoice->id,
            'note_public'  => 'public foo',
            'note_private' => 'private bar',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($invoice->id);
        $this->assertSame('public foo', $reloaded->note_public);
        $this->assertSame('private bar', $reloaded->note_private);
    }

    public function testUpdateFkCondReglement(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [, $code] = $controller->update(['id' => $invoice->id, 'fk_cond_reglement' => 5]);
        $this->assertSame(200, $code);

        $this->assertSame(5, (int) $this->reload($invoice->id)->cond_reglement_id);
    }

    public function testUpdateFkModeReglement(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [, $code] = $controller->update(['id' => $invoice->id, 'fk_mode_reglement' => 3]);
        $this->assertSame(200, $code);

        $this->assertSame(3, (int) $this->reload($invoice->id)->mode_reglement_id);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();
        $datef = strtotime('2026-05-18');

        [, $code] = $controller->update([
            'id'                => $invoice->id,
            'ref_client'        => 'MULTI',
            'datef'             => '2026-05-18',
            'note_public'       => 'multi note',
            'fk_cond_reglement' => 7,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($invoice->id);
        $this->assertSame('MULTI', $reloaded->ref_client);
        $this->assertSame($datef, (int) $reloaded->date);
        $this->assertSame('multi note', $reloaded->note_public);
        $this->assertSame(7, (int) $reloaded->cond_reglement_id);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        $user->rights->facture->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $invoice->id, 'ref_client' => 'X']);
        } finally {
            $user->rights->facture->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Forbidden', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new InvoiceController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Invoice id is required', $body['error']);
    }

    public function testUpdateReturns404WhenInvoiceMissing(): void
    {
        $controller = new InvoiceController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Invoice not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field (total_ht) is now rejected
     * with 400 and the offending key appears in `errors`. This replaces the
     * legacy "silently ignored" behaviour. importMappedData() strictly
     * enforces writableFields.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $invoice = $this->createDraftInvoice();
        $originalTotal = (float) $invoice->total_ht;
        $controller = new InvoiceController();

        [$body, $code] = $controller->update(['id' => $invoice->id, 'total_ht' => 1000]);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('total_ht', $body['errors']);
        $this->assertSame(
            $originalTotal,
            (float) $this->reload($invoice->id)->total_ht,
            'total_ht must NOT be modified when the call is rejected'
        );
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsStatut(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [$body, $code] = $controller->update(['id' => $invoice->id, 'statut' => 1]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertSame(0, (int) $this->reload($invoice->id)->statut, 'statut must remain 0 (draft)');
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [$body, $code] = $controller->update(['id' => $invoice->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [$body, $code] = $controller->update([
            'id'       => $invoice->id,
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
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [$body, $code] = $controller->update([
            'id'    => $invoice->id,
            'lines' => [['description' => 'should be rejected', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * The pre-refactor controller had explicit (int) casts on fk_cond_reglement
     * and fk_mode_reglement. Post-refactor, _castInputValue() inside the mapper
     * is responsible for the cast. This test asserts that a stringified integer
     * sent by a JSON client lands as a real int in the persisted row.
     */
    public function testUpdateCastsStringFkAsInt(): void
    {
        $invoice = $this->createDraftInvoice();
        $controller = new InvoiceController();

        [, $code] = $controller->update(['id' => $invoice->id, 'fk_cond_reglement' => '5']);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($invoice->id);
        $this->assertSame(5, $reloaded->cond_reglement_id, 'string "5" must be cast to int 5');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'facture', 'product', 'produit', 'service', 'banque', 'projet'];
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
        $conf->global->FACTURE_ADDON     = 'mod_facture_terre';
        $conf->global->FACTURE_ADDON_PDF = 'crabe';

        $entity = (int) ($conf->entity ?? 1);
        $tmp = sys_get_temp_dir() . '/dolipocket-invoice-update-test';
        @mkdir($tmp, 0777, true);
        $conf->facture->multidir_output = [$entity => $tmp];
        $conf->facture->dir_output = $tmp;

        foreach ([
            ['societe', 'lire'], ['societe', 'creer'],
            ['facture', 'lire'], ['facture', 'creer'],
        ] as $r) {
            [$obj, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }
}
