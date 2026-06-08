<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\SupplierOrderController;

/**
 * Characterization tests for SupplierOrderController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before
 * its migration to dmSupplierOrder::importMappedData() (Spec C, cf
 * SPEC_C_DOLIPOCKET_SUPPLIER_ORDER.md).
 *
 * Quirks captured:
 *  - socid -> $obj->socid + $obj->fk_soc (double assignment).
 *  - fk_cond_reglement -> $obj->cond_reglement_id (rename).
 *  - fk_mode_reglement -> $obj->mode_reglement_id (rename).
 *  - 3-arg hasRight ('fournisseur', 'commande', 'creer').
 *  - parseDate coalesces null to 0 (different from normalizeTimestamp).
 *  - LEGACY BUG: date_livraison is assigned to $obj->date_livraison
 *    but CommandeFournisseur::update() reads $obj->delivery_date for
 *    the SQL UPDATE (cf fournisseur.commande.class.php:1695). So the
 *    SQL column ends up being cleared instead of updated. The Phase 1
 *    test #4 characterizes this; Phase 2 fixes it via the re-route.
 */
class SupplierOrderControllerUpdateTest extends DolibarrRealTestCase
{
    /** @var int Pivot supplier seeded once for the suite. */
    private static $socId;

    /** @var int Secondary supplier for socid-change tests. */
    private static $socId2;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/SendEmailTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PdfDownloadTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmSupplierOrder.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/SupplierOrderController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'SupplierOrderUpdate-' . uniqid();
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }
        if (self::$socId2 === null) {
            $soc = new \Societe($db);
            $soc->name = 'SupplierOrderUpdateAlt-' . uniqid();
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe alt failed: ' . $soc->error);
            }
            self::$socId2 = (int) $r;
        }
    }

    private function createDraftSupplierOrder(): \CommandeFournisseur
    {
        global $db, $user;

        $obj = new \CommandeFournisseur($db);
        $obj->socid = self::$socId;
        $obj->fk_soc = self::$socId;
        $obj->ref_supplier = 'SEED-' . uniqid();
        $obj->date_commande = dol_now();
        $obj->date_livraison = 0;
        $r = $obj->create($user);
        if ($r <= 0) {
            $this->fail('createDraftSupplierOrder failed: ' . $obj->error);
        }
        $obj->fetch($r);
        return $obj;
    }

    private function reload(int $id): \CommandeFournisseur
    {
        global $db;
        $o = new \CommandeFournisseur($db);
        $o->fetch($id);
        return $o;
    }

    // ---------- Nominal cases ----------

    public function testUpdateRefSupplier(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'ref_supplier' => 'NEW-SUP']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('NEW-SUP', $this->reload($obj->id)->ref_supplier);
    }

    public function testUpdateDateCommandeAcceptsIsoString(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();
        $expected = strtotime('2026-05-18');

        [, $code] = $controller->update(['id' => $obj->id, 'date_commande' => '2026-05-18']);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($obj->id)->date_commande);
    }

    public function testUpdateDateCommandeAcceptsSecondsTimestamp(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();
        $expected = 1747526400;

        [, $code] = $controller->update(['id' => $obj->id, 'date_commande' => $expected]);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($obj->id)->date_commande);
    }

    /**
     * Post-refactor behaviour: date_livraison now persists onto
     * $obj->delivery_date (which is what CommandeFournisseur::update()
     * reads for the SQL `date_livraison` column, cf line 1695). The
     * legacy controller had a silent bug where it assigned the wrong
     * property; the refactor's foreach re-route fixes it.
     */
    public function testUpdateDateLivraison(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $expected = strtotime('2026-06-30');
        $controller = new SupplierOrderController();

        [, $code] = $controller->update(['id' => $obj->id, 'date_livraison' => '2026-06-30']);
        $this->assertSame(200, $code);

        $this->assertSame(
            $expected,
            (int) $this->reload($obj->id)->delivery_date,
            'date_livraison must now persist on delivery_date (legacy bug fixed)'
        );
    }

    public function testUpdateNotes(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [, $code] = $controller->update([
            'id'           => $obj->id,
            'note_public'  => 'sup-ord pub',
            'note_private' => 'sup-ord priv',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($obj->id);
        $this->assertSame('sup-ord pub', $reloaded->note_public);
        $this->assertSame('sup-ord priv', $reloaded->note_private);
    }

    public function testUpdateFkCondReglement(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [, $code] = $controller->update(['id' => $obj->id, 'fk_cond_reglement' => 5]);
        $this->assertSame(200, $code);

        $this->assertSame(5, (int) $this->reload($obj->id)->cond_reglement_id);
    }

    public function testUpdateFkModeReglement(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [, $code] = $controller->update(['id' => $obj->id, 'fk_mode_reglement' => 3]);
        $this->assertSame(200, $code);

        $this->assertSame(3, (int) $this->reload($obj->id)->mode_reglement_id);
    }

    public function testUpdateSocid(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [, $code] = $controller->update(['id' => $obj->id, 'socid' => self::$socId2]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($obj->id);
        $this->assertSame(self::$socId2, (int) $reloaded->socid);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();
        $dateCmd = strtotime('2026-05-18');

        [, $code] = $controller->update([
            'id'                => $obj->id,
            'ref_supplier'      => 'MULTI-SUP-ORD',
            'date_commande'     => '2026-05-18',
            'note_public'       => 'multi note',
            'fk_cond_reglement' => 7,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($obj->id);
        $this->assertSame('MULTI-SUP-ORD', $reloaded->ref_supplier);
        $this->assertSame($dateCmd, (int) $reloaded->date_commande);
        $this->assertSame('multi note', $reloaded->note_public);
        $this->assertSame(7, (int) $reloaded->cond_reglement_id);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        $user->rights->fournisseur->commande->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $obj->id, 'ref_supplier' => 'X']);
        } finally {
            $user->rights->fournisseur->commande->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new SupplierOrderController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Supplier order id is required', $body['error']);
    }

    public function testUpdateReturns404WhenSupplierOrderMissing(): void
    {
        $controller = new SupplierOrderController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Supplier order not found', $body['error']);
    }

    public function testUpdateRejectsUnknownField(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $originalTotal = (float) $obj->total_ht;
        $controller = new SupplierOrderController();

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
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'statut' => 1]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertSame(0, (int) $this->reload($obj->id)->statut, 'statut must remain 0 (draft)');
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [$body, $code] = $controller->update(['id' => $obj->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

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
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

        [$body, $code] = $controller->update([
            'id'    => $obj->id,
            'lines' => [['description' => 'should be rejected', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    public function testUpdateCastsStringFkAsInt(): void
    {
        $obj = $this->createDraftSupplierOrder();
        $controller = new SupplierOrderController();

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
        $conf->global->SUPPLIER_ORDER_ADDON     = 'mod_commande_fournisseur_muguet';
        $conf->global->SUPPLIER_ORDER_ADDON_PDF = 'muscadet';

        $entity = (int) ($conf->entity ?? 1);
        $tmp = sys_get_temp_dir() . '/dolipocket-supplier-order-update-test';
        @mkdir($tmp, 0777, true);
        if (!isset($conf->fournisseur->commande) || !is_object($conf->fournisseur->commande)) {
            $conf->fournisseur->commande = new \stdClass();
        }
        $conf->fournisseur->commande->multidir_output = [$entity => $tmp];
        $conf->fournisseur->commande->dir_output = $tmp;

        foreach (['societe', 'fournisseur'] as $obj) {
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
        }
        $user->rights->societe->lire = 1;
        $user->rights->societe->creer = 1;

        if (!isset($user->rights->fournisseur->commande)) {
            $user->rights->fournisseur->commande = new \stdClass();
        }
        $user->rights->fournisseur->commande->lire = 1;
        $user->rights->fournisseur->commande->creer = 1;
    }
}
