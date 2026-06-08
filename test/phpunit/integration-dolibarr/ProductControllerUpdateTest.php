<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProductController;

/**
 * Characterization tests for ProductController::update($arr).
 *
 * Freezes the contract of the current manual-mapping update() before the
 * Spec B Phase 2 refactor (cf SPEC_B_DOLIPOCKET_PRODUCT.md). Two
 * particularities for Product:
 *  - the auth check is dynamic: the required right depends on
 *    \$product->type (produit/creer vs service/creer). Therefore fetch
 *    must happen BEFORE the auth check; 404 is returned before 403.
 *  - price / price_ttc / tva_tx must transit through updatePrice(),
 *    not be assigned directly, so the SQL price log and derived fields
 *    stay coherent.
 *
 * Test plan:
 *  - 8 nominal cases (ref, label, description, dims, status, status_buy,
 *    barcode, price)
 *  - 2 dynamic-right cases (403 on a service for a produit-only user, and
 *    vice versa)
 *  - 3 error paths (400 missing id, 404 not found, legacy
 *    "unknown field silently ignored" -- to be flipped in Phase 2).
 */
class ProductControllerUpdateTest extends DolibarrRealTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        global $user;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmProduct.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProductController.php';
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();
    }

    /**
     * Create a fresh product (or service) directly via Product to isolate
     * the update() behaviour from the controller's create().
     *
     * @param int $type 0 = product, 1 = service
     */
    private function createProduct(int $type = 0): \Product
    {
        global $db, $user;

        $product = new \Product($db);
        $product->ref = 'PCU-' . uniqid();
        $product->label = 'Test ' . ($type === 1 ? 'service' : 'product');
        $product->type = $type;
        $product->price = 100.0;
        $product->price_base_type = 'HT';
        $product->tva_tx = 20.0;
        $product->status = 1;
        $product->status_buy = 1;
        $product->finished = 1;
        // Initialize measurement unit scales so Product::update() does not
        // trip on measuring_units_squared(null) when length+width are set
        // together (cf product.class.php:1078 + product.lib.php:874).
        $product->weight_units = 0;
        $product->length_units = 0;
        $product->width_units = 0;
        $product->height_units = 0;
        $r = $product->create($user);
        if ($r <= 0) {
            $this->fail('createProduct failed: ' . $product->error);
        }
        $product->fetch($r);
        return $product;
    }

    private function reload(int $id): \Product
    {
        global $db;
        $p = new \Product($db);
        $p->fetch($id);
        return $p;
    }

    // ---------- Nominal cases ----------

    public function testUpdateRef(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [$body, $code] = $controller->update(['id' => $product->id, 'ref' => 'NEW-REF']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('NEW-REF', $this->reload($product->id)->ref);
    }

    public function testUpdateLabel(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'label' => 'New label']);
        $this->assertSame(200, $code);

        $this->assertSame('New label', $this->reload($product->id)->label);
    }

    public function testUpdateDescription(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'description' => 'Some description']);
        $this->assertSame(200, $code);

        $this->assertSame('Some description', $this->reload($product->id)->description);
    }

    public function testUpdateDimensions(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update([
            'id'     => $product->id,
            'weight' => 1.5,
            'length' => 10.0,
            'width'  => 5.0,
            'height' => 3.0,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($product->id);
        $this->assertSame(1.5, (float) $reloaded->weight);
        $this->assertSame(10.0, (float) $reloaded->length);
        $this->assertSame(5.0, (float) $reloaded->width);
        $this->assertSame(3.0, (float) $reloaded->height);
    }

    public function testUpdateStatus(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'status' => 0]);
        $this->assertSame(200, $code);

        $this->assertSame(0, (int) $this->reload($product->id)->status);
    }

    public function testUpdateStatusBuy(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'status_buy' => 0]);
        $this->assertSame(200, $code);

        $this->assertSame(0, (int) $this->reload($product->id)->status_buy);
    }

    public function testUpdateBarcode(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'barcode' => '1234567890123']);
        $this->assertSame(200, $code);

        $this->assertSame('1234567890123', $this->reload($product->id)->barcode);
    }

    /**
     * price flows through Product::updatePrice(), not a direct assignment.
     * After fetch, $product->price reflects the new HT value.
     */
    public function testUpdatePrice(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'price' => 250.0]);
        $this->assertSame(200, $code);

        $this->assertSame(250.0, (float) $this->reload($product->id)->price);
    }

    // ---------- Dynamic-right cases ----------

    public function testUpdateServiceWithoutServiceRightReturns403(): void
    {
        global $user;
        $service = $this->createProduct(1); // type = service
        $controller = new ProductController();

        $user->rights->service->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $service->id, 'label' => 'X']);
        } finally {
            $user->rights->service->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateProductWithoutProduitRightReturns403(): void
    {
        global $user;
        $product = $this->createProduct(0); // type = product
        $controller = new ProductController();

        $user->rights->produit->creer = 0;
        try {
            [$body, $code] = $controller->update(['id' => $product->id, 'label' => 'X']);
        } finally {
            $user->rights->produit->creer = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new ProductController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Product id is required', $body['error']);
    }

    public function testUpdateReturns404WhenProductMissing(): void
    {
        $controller = new ProductController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Product not found', $body['error']);
    }

    /**
     * Post-refactor behaviour: a non-writable field (stock_reel) is now
     * rejected with 400 and the offending key appears in `errors`.
     * importMappedData() strictly enforces writableFields.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $product = $this->createProduct();
        $originalStock = (int) $product->stock_reel;
        $controller = new ProductController();

        [$body, $code] = $controller->update(['id' => $product->id, 'stock_reel' => 999]);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('stock_reel', $body['errors']);
        $this->assertSame(
            $originalStock,
            (int) $this->reload($product->id)->stock_reel,
            'stock_reel must NOT be modified when the call is rejected'
        );
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsPmp(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [$body, $code] = $controller->update(['id' => $product->id, 'pmp' => 99.0]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('pmp', $body['errors']);
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [$body, $code] = $controller->update(['id' => $product->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [$body, $code] = $controller->update([
            'id'         => $product->id,
            'pmp'        => 99.0,
            'stock_reel' => 999,
            'foo'        => 'bar',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('pmp', $body['errors']);
        $this->assertArrayHasKey('stock_reel', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [$body, $code] = $controller->update([
            'id'    => $product->id,
            'lines' => [['description' => 'irrelevant for product', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * The pre-refactor controller had an explicit (int) cast on status.
     * Post-refactor, _castInputValue() inside the mapper is responsible
     * for the cast. This test asserts that a stringified integer sent
     * by a JSON client lands as a real int in the persisted row.
     */
    public function testUpdateCastsStringStatusAsInt(): void
    {
        $product = $this->createProduct();
        $controller = new ProductController();

        [, $code] = $controller->update(['id' => $product->id, 'status' => '0']);
        $this->assertSame(200, $code);

        $this->assertSame(0, $this->reload($product->id)->status, 'string "0" must be cast to int 0');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['produit', 'product', 'service', 'banque'];
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
        $conf->global->PRODUCT_CODEPRODUCT_ADDON = 'mod_codeproduct_leopard';

        foreach ([
            ['produit', 'lire'], ['produit', 'creer'], ['produit', 'supprimer'],
            ['service', 'lire'], ['service', 'creer'], ['service', 'supprimer'],
        ] as $r) {
            [$obj, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }
}
