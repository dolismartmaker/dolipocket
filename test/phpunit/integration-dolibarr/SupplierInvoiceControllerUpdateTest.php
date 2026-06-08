<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\SupplierInvoiceController;

/**
 * Characterization tests for SupplierInvoiceController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before its
 * migration to dmSupplierInvoice::importMappedData() (Spec C, cf
 * SPEC_C_DOLIPOCKET_SUPPLIER_INVOICE.md). Pattern is close to Invoice
 * but with 4 quirks instead of 2:
 *  - socid -> $obj->socid + $obj->fk_soc (double assignment)
 *  - libelle -> $obj->label (rename; SQL UPDATE writes
 *    "libelle = $this->label" cf fournisseur.facture.class.php:1269)
 *  - datef -> $obj->date + $obj->datef (mirror, same as Invoice)
 *  - date_lim_reglement -> $obj->date_echeance (rename)
 *  - fk_cond_reglement / fk_mode_reglement: same renames as Invoice/Order.
 *
 * Right check is 3-arg: hasRight('fournisseur', 'facture', 'creer').
 * parseDate() coalesces null to 0 (epoch) instead of leaving the previous
 * value, unlike normalizeTimestamp on Invoice/Order/Proposal.
 */
class SupplierInvoiceControllerUpdateTest extends DolibarrRealTestCase
{
    /** @var int Pivot supplier seeded once for the suite. */
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
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmSupplierInvoice.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/SupplierInvoiceController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'SupplierInvUpdate-' . uniqid();
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }
    }

    /**
     * Create a fresh draft supplier invoice directly via FactureFournisseur
     * so each test isolates update() behaviour.
     */
    private function createDraftSupplierInvoice(): \FactureFournisseur
    {
        global $db, $user;

        $obj = new \FactureFournisseur($db);
        $obj->socid = self::$socId;
        $obj->fk_soc = self::$socId;
        $obj->ref_supplier = 'SEED-' . uniqid();
        $obj->type = \FactureFournisseur::TYPE_STANDARD;
        $obj->libelle = 'Seed invoice';
        $obj->label = $obj->libelle;
        $obj->date = dol_now();
        $obj->datef = $obj->date;
        $r = $obj->create($user);
        if ($r <= 0) {
            $this->fail('createDraftSupplierInvoice failed: ' . $obj->error);
        }
        $obj->fetch($r);
        return $obj;
    }

    private function reload(int $id): \FactureFournisseur
    {
        global $db;
        $o = new \FactureFournisseur($db);
        $o->fetch($id);
        return $o;
    }

    // ---------- Nominal cases (10 writable scenarios) ----------

    public function testUpdateRefSupplier(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'ref_supplier' => 'NEW-SUP-REF']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('NEW-SUP-REF', $this->reload($obj->id)->ref_supplier);
    }

    public function testUpdateDatefAcceptsIsoString(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();
        $expected = strtotime('2026-05-18');

        [, $code] = $controller->update(['id' => $obj->id, 'datef' => '2026-05-18']);
        $this->assertSame(200, $code);

        // FactureFournisseur::fetch peuple $this->date depuis la colonne `datef`
        // (cf fournisseur.facture.class.php:951).
        $this->assertSame($expected, (int) $this->reload($obj->id)->date);
    }

    public function testUpdateDatefAcceptsSecondsTimestamp(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();
        $expected = 1747526400;

        [, $code] = $controller->update(['id' => $obj->id, 'datef' => $expected]);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($obj->id)->date);
    }

    public function testUpdateDateLimReglement(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();
        $expected = strtotime('2026-06-30');

        [, $code] = $controller->update(['id' => $obj->id, 'date_lim_reglement' => '2026-06-30']);
        $this->assertSame(200, $code);

        // Quirk: API key date_lim_reglement maps to PHP property date_echeance.
        $this->assertSame($expected, (int) $this->reload($obj->id)->date_echeance);
    }

    public function testUpdateNotes(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update([
            'id'           => $obj->id,
            'note_public'  => 'sup pub',
            'note_private' => 'sup priv',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($obj->id);
        $this->assertSame('sup pub', $reloaded->note_public);
        $this->assertSame('sup priv', $reloaded->note_private);
    }

    public function testUpdateLibelleWritesToLabel(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update(['id' => $obj->id, 'libelle' => 'New label']);
        $this->assertSame(200, $code);

        // Quirk: API key libelle ends up on $obj->label (and on the
        // deprecated $obj->libelle mirror). FactureFournisseur::update()
        // line 1269 writes SQL "libelle = $this->label".
        $reloaded = $this->reload($obj->id);
        $this->assertSame('New label', $reloaded->label);
    }

    public function testUpdateFkCondReglement(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update(['id' => $obj->id, 'fk_cond_reglement' => 5]);
        $this->assertSame(200, $code);

        $this->assertSame(5, (int) $this->reload($obj->id)->cond_reglement_id);
    }

    public function testUpdateFkModeReglement(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update(['id' => $obj->id, 'fk_mode_reglement' => 3]);
        $this->assertSame(200, $code);

        $this->assertSame(3, (int) $this->reload($obj->id)->mode_reglement_id);
    }

    /**
     * type is writable per dmSupplierInvoice::writableFields. The seed is
     * TYPE_STANDARD = 0; toggling to 1 (credit note) is a low-risk change
     * for an update (no metier verification when flipping the value).
     */
    public function testUpdateType(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update(['id' => $obj->id, 'type' => 1]);
        $this->assertSame(200, $code);

        $this->assertSame(1, (int) $this->reload($obj->id)->type);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();
        $datef = strtotime('2026-05-18');
        $dateLim = strtotime('2026-06-30');

        [, $code] = $controller->update([
            'id'                 => $obj->id,
            'ref_supplier'       => 'MULTI-SUP',
            'libelle'            => 'Multi label',
            'datef'              => '2026-05-18',
            'date_lim_reglement' => '2026-06-30',
            'note_public'        => 'multi pub',
            'fk_cond_reglement'  => 7,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($obj->id);
        $this->assertSame('MULTI-SUP', $reloaded->ref_supplier);
        $this->assertSame('Multi label', $reloaded->label);
        $this->assertSame($datef, (int) $reloaded->date);
        $this->assertSame($dateLim, (int) $reloaded->date_echeance);
        $this->assertSame('multi pub', $reloaded->note_public);
        $this->assertSame(7, (int) $reloaded->cond_reglement_id);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        $user->rights->fournisseur->facture->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $obj->id, 'ref_supplier' => 'X']);
        } finally {
            $user->rights->fournisseur->facture->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new SupplierInvoiceController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Supplier invoice id is required', $body['error']);
    }

    public function testUpdateReturns404WhenSupplierInvoiceMissing(): void
    {
        $controller = new SupplierInvoiceController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Supplier invoice not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field (total_ht) is now
     * rejected with 400 and the offending key appears in `errors`.
     * importMappedData() strictly enforces writableFields.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $originalTotal = (float) $obj->total_ht;
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'total_ht' => 1000]);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('total_ht', $body['errors']);
        $this->assertSame(
            $originalTotal,
            (float) $this->reload($obj->id)->total_ht,
            'total_ht must NOT be modified when the call is rejected'
        );
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsStatut(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'statut' => 1]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertSame(0, (int) $this->reload($obj->id)->statut, 'statut must remain 0 (draft)');
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update([
            'id'       => $obj->id,
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
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [$body, $code] = $controller->update([
            'id'    => $obj->id,
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
     */
    public function testUpdateCastsStringFkAsInt(): void
    {
        $obj = $this->createDraftSupplierInvoice();
        $controller = new SupplierInvoiceController();

        [, $code] = $controller->update(['id' => $obj->id, 'fk_cond_reglement' => '5']);
        $this->assertSame(200, $code);

        $this->assertSame(5, $this->reload($obj->id)->cond_reglement_id, 'string "5" must be cast to int 5');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'fournisseur', 'product', 'produit', 'service', 'banque', 'projet'];
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
        $conf->global->SUPPLIER_INVOICE_ADDON     = 'mod_facture_fournisseur_cactus';
        $conf->global->SUPPLIER_INVOICE_ADDON_PDF = 'canelle';

        $entity = (int) ($conf->entity ?? 1);
        $tmp = sys_get_temp_dir() . '/dolipocket-supplier-invoice-update-test';
        @mkdir($tmp, 0777, true);
        // FactureFournisseur stores its files under fournisseur->facture->dir_output
        if (!isset($conf->fournisseur->facture) || !is_object($conf->fournisseur->facture)) {
            $conf->fournisseur->facture = new \stdClass();
        }
        $conf->fournisseur->facture->multidir_output = [$entity => $tmp];
        $conf->fournisseur->facture->dir_output = $tmp;

        // societe and fournisseur (level-1)
        foreach (['societe', 'fournisseur'] as $obj) {
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
        }
        $user->rights->societe->lire = 1;
        $user->rights->societe->creer = 1;

        // 3-arg right: fournisseur->facture->creer / lire
        if (!isset($user->rights->fournisseur->facture)) {
            $user->rights->fournisseur->facture = new \stdClass();
        }
        $user->rights->fournisseur->facture->lire = 1;
        $user->rights->fournisseur->facture->creer = 1;
    }
}
