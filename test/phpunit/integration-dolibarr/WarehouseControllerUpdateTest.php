<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\WarehouseController;

/**
 * Characterization tests for WarehouseController::update($arr).
 *
 * Simplest target of the Spec C catalogue: 10 writable scalar fields,
 * all identity-mapped, no quirk re-route, no extrafields helper.
 * Auth check is hasRight('stock', 'creer') (2-arg).
 */
class WarehouseControllerUpdateTest extends DolibarrRealTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        global $user;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmWarehouse.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/WarehouseController.php';
        require_once DOL_DOCUMENT_ROOT . '/product/stock/class/entrepot.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();
    }

    private function createWarehouse(): \Entrepot
    {
        global $db, $user;

        $w = new \Entrepot($db);
        $w->label = 'Seed-' . uniqid();
        $w->statut = 1;
        $r = $w->create($user);
        if ($r <= 0) {
            $this->fail('createWarehouse failed: ' . $w->error);
        }
        $w->fetch($r);
        return $w;
    }

    private function reload(int $id): \Entrepot
    {
        global $db;
        $w = new \Entrepot($db);
        $w->fetch($id);
        return $w;
    }

    // ---------- Nominal cases ----------

    public function testUpdateLabel(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [$body, $code] = $controller->update(['id' => $w->id, 'label' => 'New Label']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('New Label', $this->reload($w->id)->label);
    }

    public function testUpdateDescription(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update(['id' => $w->id, 'description' => 'Some description']);
        $this->assertSame(200, $code);

        $this->assertSame('Some description', $this->reload($w->id)->description);
    }

    public function testUpdateLieu(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update(['id' => $w->id, 'lieu' => 'main hall']);
        $this->assertSame(200, $code);

        $this->assertSame('main hall', $this->reload($w->id)->lieu);
    }

    public function testUpdateAddressBundle(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update([
            'id'      => $w->id,
            'address' => '1 rue de la paix',
            'zip'     => '75001',
            'town'    => 'Paris',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($w->id);
        $this->assertSame('1 rue de la paix', $reloaded->address);
        $this->assertSame('75001', $reloaded->zip);
        $this->assertSame('Paris', $reloaded->town);
    }

    public function testUpdatePhoneFax(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update([
            'id'    => $w->id,
            'phone' => '+33123456789',
            'fax'   => '+33198765432',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($w->id);
        $this->assertSame('+33123456789', $reloaded->phone);
        $this->assertSame('+33198765432', $reloaded->fax);
    }

    public function testUpdateStatut(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update(['id' => $w->id, 'statut' => 0]);
        $this->assertSame(200, $code);

        $this->assertSame(0, (int) $this->reload($w->id)->statut);
    }

    public function testUpdateFkParent(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        // fk_parent = 0 means "root warehouse" (no parent).
        [, $code] = $controller->update(['id' => $w->id, 'fk_parent' => 0]);
        $this->assertSame(200, $code);

        $this->assertSame(0, (int) $this->reload($w->id)->fk_parent);
    }

    public function testUpdateMultipleFieldsAtOnce(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update([
            'id'          => $w->id,
            'label'       => 'Combo',
            'lieu'        => 'combo lieu',
            'town'        => 'Lyon',
            'phone'       => '+33178945612',
            'statut'      => 0,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($w->id);
        $this->assertSame('Combo', $reloaded->label);
        $this->assertSame('combo lieu', $reloaded->lieu);
        $this->assertSame('Lyon', $reloaded->town);
        $this->assertSame('+33178945612', $reloaded->phone);
        $this->assertSame(0, (int) $reloaded->statut);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WithoutRight(): void
    {
        global $user;
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        $user->rights->stock->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $w->id, 'label' => 'X']);
        } finally {
            $user->rights->stock->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new WarehouseController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Warehouse id is required', $body['error']);
    }

    public function testUpdateReturns404WhenWarehouseMissing(): void
    {
        $controller = new WarehouseController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Warehouse not found', $body['error']);
    }

    /**
     * Post-refactor: a non-writable field is now rejected with 400.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $w = $this->createWarehouse();
        $originalLabel = $w->label;
        $controller = new WarehouseController();

        [$body, $code] = $controller->update(['id' => $w->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
        $this->assertSame($originalLabel, $this->reload($w->id)->label, 'label unchanged');
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    /**
     * `ref` is intentionally NOT in dmWarehouse::$writableFields: the
     * warehouse code is auto-generated. Sending it must be rejected.
     */
    public function testUpdateRejectsRef(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [$body, $code] = $controller->update(['id' => $w->id, 'ref' => 'FORGED-REF']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('ref', $body['errors']);
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [$body, $code] = $controller->update(['id' => $w->id, 'random_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('random_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [$body, $code] = $controller->update([
            'id'  => $w->id,
            'ref' => 'FORGED',
            'foo' => 'bar',
            'baz' => 'qux',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('ref', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
        $this->assertArrayHasKey('baz', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [$body, $code] = $controller->update([
            'id'    => $w->id,
            'lines' => [['description' => 'irrelevant for warehouse', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * statut had an explicit (int) cast in the legacy controller. Post-refactor
     * the mapper's _castInputValue() takes over.
     */
    public function testUpdateCastsStringStatutAsInt(): void
    {
        $w = $this->createWarehouse();
        $controller = new WarehouseController();

        [, $code] = $controller->update(['id' => $w->id, 'statut' => '0']);
        $this->assertSame(200, $code);

        $this->assertSame(0, $this->reload($w->id)->statut, 'string "0" must be cast to int 0');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['stock'];
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

        if (!isset($user->rights->stock)) {
            $user->rights->stock = new \stdClass();
        }
        $user->rights->stock->lire = 1;
        $user->rights->stock->creer = 1;
        $user->rights->stock->supprimer = 1;
    }
}
