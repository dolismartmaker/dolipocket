<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\OrderController;

/**
 * Characterization tests for OrderController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before it is
 * migrated to dmOrder::importMappedData() (Spec B Phase 1, cf
 * smartauth documentation/SPEC_B_DOLIPOCKET_ORDER.md). Exercises:
 *   - 8 nominal cases on the 7 writable fields and their combination
 *   - 4 error paths: forbidden, missing id, not found, unknown-field-ignored
 *
 * The testUpdateSilentlyIgnoresUnknownField test captures the LEGACY
 * behaviour (200 + total_ht dropped on the floor). Phase 2 will rewrite
 * it to expect 400 + errors.total_ht because importMappedData() strictly
 * rejects fields outside writableFields.
 */
class OrderControllerUpdateTest extends DolibarrRealTestCase
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
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmOrder.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/OrderController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'OrderUpdate-' . uniqid();
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
     * Create a fresh draft order via Commande directly (not via the
     * controller's create()) so each test isolates update() behaviour.
     */
    private function createDraftOrder(): \Commande
    {
        global $db, $user;

        $cmd = new \Commande($db);
        $cmd->socid = self::$socId;
        $cmd->date_commande = dol_now();
        $r = $cmd->create($user);
        if ($r <= 0) {
            $this->fail('createDraftOrder failed: ' . $cmd->error);
        }
        $cmd->fetch($r);
        return $cmd;
    }

    private function reload(int $id): \Commande
    {
        global $db;
        $c = new \Commande($db);
        $c->fetch($id);
        return $c;
    }

    // ---------- Nominal cases (the 7 writable fields + combination) ----------

    public function testUpdateRefClient(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [$body, $code] = $controller->update(['id' => $order->id, 'ref_client' => 'ORD-REF-42']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('ORD-REF-42', $this->reload($order->id)->ref_client);
    }

    public function testUpdateDateCommandeAcceptsIsoString(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();
        $expected = strtotime('2026-05-18');

        [, $code] = $controller->update(['id' => $order->id, 'date_commande' => '2026-05-18']);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($order->id)->date_commande);
    }

    public function testUpdateDateCommandeAcceptsSecondsTimestamp(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();
        $expected = 1747526400;

        [, $code] = $controller->update(['id' => $order->id, 'date_commande' => $expected]);
        $this->assertSame(200, $code);

        $this->assertSame($expected, (int) $this->reload($order->id)->date_commande);
    }

    public function testUpdateDateLivraison(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();
        $expected = strtotime('2026-06-30');

        [, $code] = $controller->update(['id' => $order->id, 'date_livraison' => '2026-06-30']);
        $this->assertSame(200, $code);

        // Commande::fetch() peuple $delivery_date depuis la colonne SQL `date_livraison`
        // (cf commande.class.php:1976-1977). C'est la propriete cible non-deprecated.
        $this->assertSame($expected, (int) $this->reload($order->id)->delivery_date);
    }

    public function testUpdateNotes(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [, $code] = $controller->update([
            'id'           => $order->id,
            'note_public'  => 'order pub',
            'note_private' => 'order priv',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($order->id);
        $this->assertSame('order pub', $reloaded->note_public);
        $this->assertSame('order priv', $reloaded->note_private);
    }

    public function testUpdateFkCondReglement(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [, $code] = $controller->update(['id' => $order->id, 'fk_cond_reglement' => 5]);
        $this->assertSame(200, $code);

        $this->assertSame(5, (int) $this->reload($order->id)->cond_reglement_id);
    }

    public function testUpdateFkModeReglement(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [, $code] = $controller->update(['id' => $order->id, 'fk_mode_reglement' => 3]);
        $this->assertSame(200, $code);

        $this->assertSame(3, (int) $this->reload($order->id)->mode_reglement_id);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();
        $dateCmd = strtotime('2026-05-18');
        $deliv = strtotime('2026-06-30');

        [, $code] = $controller->update([
            'id'                => $order->id,
            'ref_client'        => 'ORD-MULTI',
            'date_commande'     => '2026-05-18',
            'date_livraison'    => '2026-06-30',
            'note_public'       => 'multi order',
            'fk_cond_reglement' => 7,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($order->id);
        $this->assertSame('ORD-MULTI', $reloaded->ref_client);
        $this->assertSame($dateCmd, (int) $reloaded->date_commande);
        $this->assertSame($deliv, (int) $reloaded->delivery_date);
        $this->assertSame('multi order', $reloaded->note_public);
        $this->assertSame(7, (int) $reloaded->cond_reglement_id);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        $user->rights->commande->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $order->id, 'ref_client' => 'X']);
        } finally {
            $user->rights->commande->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Forbidden', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new OrderController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Order id is required', $body['error']);
    }

    public function testUpdateReturns404WhenOrderMissing(): void
    {
        $controller = new OrderController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Order not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field (total_ht) is now rejected
     * with 400 and the offending key appears in `errors`. This replaces the
     * legacy "silently ignored" behaviour. importMappedData() strictly
     * enforces writableFields.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $order = $this->createDraftOrder();
        $originalTotal = (float) $order->total_ht;
        $controller = new OrderController();

        [$body, $code] = $controller->update(['id' => $order->id, 'total_ht' => 1000]);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('total_ht', $body['errors']);
        $this->assertSame(
            $originalTotal,
            (float) $this->reload($order->id)->total_ht,
            'total_ht must NOT be modified when the call is rejected'
        );
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsStatut(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [$body, $code] = $controller->update(['id' => $order->id, 'statut' => 1]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('statut', $body['errors']);
        $this->assertSame(0, (int) $this->reload($order->id)->statut, 'statut must remain 0 (draft)');
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [$body, $code] = $controller->update(['id' => $order->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [$body, $code] = $controller->update([
            'id'       => $order->id,
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
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [$body, $code] = $controller->update([
            'id'    => $order->id,
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
        $order = $this->createDraftOrder();
        $controller = new OrderController();

        [, $code] = $controller->update(['id' => $order->id, 'fk_cond_reglement' => '5']);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($order->id);
        $this->assertSame(5, $reloaded->cond_reglement_id, 'string "5" must be cast to int 5');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'commande', 'product', 'produit', 'service', 'banque', 'projet'];
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
        $conf->global->COMMANDE_ADDON     = 'mod_commande_saphir';
        $conf->global->COMMANDE_ADDON_PDF = 'einstein';

        $entity = (int) ($conf->entity ?? 1);
        $tmp = sys_get_temp_dir() . '/dolipocket-order-update-test';
        @mkdir($tmp, 0777, true);
        $conf->commande->multidir_output = [$entity => $tmp];
        $conf->commande->dir_output = $tmp;

        foreach ([
            ['societe', 'lire'], ['societe', 'creer'],
            ['commande', 'lire'], ['commande', 'creer'],
        ] as $r) {
            [$obj, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }
}
