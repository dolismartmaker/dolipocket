<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\InvoiceController;
use Dolipocket\Api\OrderController;
use Dolipocket\Api\ProposalController;
use Dolipocket\Api\SupplierInvoiceController;
use Dolipocket\Api\SupplierOrderController;

/**
 * End-to-end CRUD tests for document line endpoints. Each document type
 * (proposal / order / invoice / supplierorder / supplierinvoice) is
 * exercised through its full lifecycle from the API:
 *
 *   1. seed a third-party + create a draft document
 *   2. addLine() with a free description (qty/subprice/tva_tx)
 *   3. addLine() with fk_product (auto-hydration from the Product record)
 *   4. updateLine() to change qty/subprice
 *   5. deleteLine()
 *
 * Why this suite exists: prior to Lot 9 line-editing the addLine controllers
 * silently dropped service metadata (date_start / date_end / fk_unit) and
 * never read product defaults when fk_product was supplied alone. A user
 * who picked a product had to re-type its description and subprice -- worse
 * UX than Dolibarr standard. This sentinel guards both the SQL safety of
 * the line endpoints and the product auto-hydration contract.
 */
class DocumentLinesCrudTest extends DolibarrRealTestCase
{
    /** @var int Pivot thirdparty seeded once for the suite. */
    private static $socId;

    /** @var int Pivot product seeded once for the suite. */
    private static $productId;

    /**
     * @return array<string,array{string,array<int,array{string,?string,string}>,?string,string,string}>
     * Each row: [controllerClass, requiredRights, refSupplierField, lineTable, lineFkColumn].
     * - lineTable is the Dolibarr table_element for the LINE class (no llx_ prefix)
     * - lineFkColumn is the column in that table pointing back to the document
     * These two extra fields are used by the rowid/id quirk sentinel to compare
     * the exported `id` against the native `rowid` from SQL.
     */
    public static function controllerProvider(): array
    {
        return [
            'proposal' => [
                ProposalController::class,
                [['propal', null, 'lire'], ['propal', null, 'creer']],
                null,
                'propaldet',
                'fk_propal',
            ],
            'order' => [
                OrderController::class,
                [['commande', null, 'lire'], ['commande', null, 'creer']],
                null,
                'commandedet',
                'fk_commande',
            ],
            'invoice' => [
                InvoiceController::class,
                [['facture', null, 'lire'], ['facture', null, 'creer']],
                null,
                'facturedet',
                'fk_facture',
            ],
            'supplierorder' => [
                SupplierOrderController::class,
                [
                    ['fournisseur', 'commande', 'lire'],
                    ['fournisseur', 'commande', 'creer'],
                    ['fournisseur', 'commande', 'create'],
                ],
                'ref_supplier',
                'commande_fournisseurdet',
                'fk_commande',
            ],
            // SupplierInvoice still deferred: Dolibarr core
            // FactureFournisseur::$special_code emits a PHP 8.2 "Undefined
            // property" warning from the bundled SQLite fixture, out of our
            // control. The backend addLine/updateLine extensions are in
            // place, only the E2E sentinel is skipped.
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        foreach ([
            'dmProposal', 'dmOrder', 'dmInvoice', 'dmSupplierOrder', 'dmSupplierInvoice',
            'ProposalController', 'OrderController', 'InvoiceController',
            'SupplierOrderController', 'SupplierInvoiceController',
        ] as $f) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $f . '.php';
        }
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'LinesCrud-' . uniqid();
            $soc->client = 1;
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('failed to seed Societe: ' . ($soc->error ?? 'unknown'));
            }
            self::$socId = (int) $r;
        }

        if (self::$productId === null) {
            $prod = new \Product($db);
            $prod->ref = 'LINETST-' . uniqid();
            $prod->label = 'Test product label';
            $prod->description = 'Test product description';
            $prod->price = 99.50;
            $prod->price_base_type = 'HT';
            $prod->tva_tx = 20.0;
            $prod->status = 1;
            $prod->status_buy = 1;
            $prod->type = 0;
            $r = $prod->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('failed to seed Product: ' . ($prod->error ?? 'unknown'));
            }
            self::$productId = (int) $r;
        }
    }

    /**
     * @dataProvider controllerProvider
     */
    public function testFreeLineAddUpdateDelete(string $controllerClass, array $rights, ?string $refSupplierField, string $lineTable, string $lineFkColumn): void
    {
        $this->grantRights($rights);
        $controller = new $controllerClass();

        $docId = $this->createDoc($controller, $refSupplierField);

        // 1. addLine: free description.
        [$body, $code] = $controller->addLine([
            'id'             => $docId,
            'description'    => 'Free line ' . uniqid(),
            'qty'            => 2,
            'subprice'       => 50.0,
            'tva_tx'         => 20.0,
            'remise_percent' => 5.0,
            'product_type'   => 0,
        ]);
        $this->assertSame(201, $code, 'addLine free must succeed: ' . json_encode($body));
        $lineId = $this->latestLineId($body);
        $this->assertGreaterThan(0, $lineId);

        // 2. updateLine: change qty + subprice.
        [, $upCode] = $controller->updateLine([
            'id'       => $docId,
            'lineid'   => $lineId,
            'qty'      => 3,
            'subprice' => 60.0,
        ]);
        $this->assertSame(200, $upCode, 'updateLine must succeed');

        // 3. deleteLine.
        [, $delCode] = $controller->deleteLine([
            'id'     => $docId,
            'lineid' => $lineId,
        ]);
        $this->assertSame(200, $delCode, 'deleteLine must succeed');
    }

    /**
     * @dataProvider controllerProvider
     */
    public function testProductLineAutoHydratesFromProduct(string $controllerClass, array $rights, ?string $refSupplierField, string $lineTable, string $lineFkColumn): void
    {
        $this->grantRights($rights);
        $controller = new $controllerClass();

        $docId = $this->createDoc($controller, $refSupplierField);

        // Send ONLY the product id + qty -- description / subprice / tva_tx
        // / product_type must be filled from the Product record by the
        // controller's auto-hydration block.
        [$body, $code] = $controller->addLine([
            'id'         => $docId,
            'fk_product' => self::$productId,
            'qty'        => 1,
        ]);
        $this->assertSame(201, $code, 'addLine product must succeed: ' . json_encode($body));

        // Inspect the created line to check the hydration happened.
        $lines = is_object($body) && isset($body->lines) ? $body->lines : (is_array($body) && isset($body['lines']) ? $body['lines'] : []);
        $this->assertNotEmpty($lines, 'document must have at least one line after addLine');
        $last = end($lines);
        $last = is_array($last) ? (object) $last : $last;

        $this->assertSame((int) self::$productId, (int) ($last->fk_product ?? 0), 'fk_product must be persisted');

        // Subprice was not supplied; controller must have used Product->price (99.50).
        // Tolerate float drift.
        $this->assertEqualsWithDelta(99.50, (float) ($last->subprice ?? 0), 0.01, 'subprice must auto-fill from Product->price');
    }

    /**
     * Lot 11 sentinel: addLine() with product_type=9 + special_code=0
     * persists a TITLE line (label only, no qty/subprice computation).
     *
     * The contract: a title line has product_type=9 and special_code=0,
     * carries the description back through the mapper, and qty/subprice
     * stay at zero so PDF templates render it as a section header rather
     * than a line item.
     *
     * @dataProvider controllerProvider
     */
    public function testAddTitleLine(string $controllerClass, array $rights, ?string $refSupplierField, string $lineTable, string $lineFkColumn): void
    {
        $this->grantRights($rights);
        $controller = new $controllerClass();

        $docId = $this->createDoc($controller, $refSupplierField);

        $titleLabel = 'Section Title ' . uniqid();
        // qty=1 (not 0) so Propal does not silently overwrite special_code
        // with 3 ("option" tag) via `if (empty($qty) && empty($special_code))`.
        // The line stays purely cosmetic because product_type=9 is what
        // PDF templates check to skip computation.
        [$body, $code] = $controller->addLine([
            'id'           => $docId,
            'description'  => $titleLabel,
            'label'        => $titleLabel,
            'qty'          => 1,
            'subprice'     => 0,
            'tva_tx'       => 0,
            'product_type' => 9,
            'special_code' => 0,
        ]);
        $this->assertSame(201, $code, 'addLine title must succeed: ' . json_encode($body));

        $lines = is_object($body) && isset($body->lines)
            ? $body->lines
            : (is_array($body) && isset($body['lines']) ? $body['lines'] : []);
        $this->assertNotEmpty($lines, 'document must have at least one line after adding a title');

        $last = end($lines);
        $last = is_array($last) ? (object) $last : $last;
        $this->assertSame(9, (int) ($last->productType ?? $last->product_type ?? 0), 'title line must carry product_type=9');
        $this->assertSame(0, (int) ($last->specialCode ?? $last->special_code ?? -1), 'title line must carry special_code=0');
        $description = (string) ($last->description ?? '');
        $label = (string) ($last->label ?? '');
        $this->assertTrue(
            strpos($description, $titleLabel) !== false || strpos($label, $titleLabel) !== false,
            'title label must be persisted in description or label'
        );
    }

    /**
     * Lot 11 sentinel: addLine() with product_type=9 + special_code=104
     * persists a SUB-TOTAL line. The community 'linesubtotal' convention
     * reserves special_code 104 for sub-total markers; Dolipocket follows
     * this convention so PDF rendering by the community module remains
     * compatible.
     *
     * @dataProvider controllerProvider
     */
    public function testAddSubtotalLine(string $controllerClass, array $rights, ?string $refSupplierField, string $lineTable, string $lineFkColumn): void
    {
        $this->grantRights($rights);
        $controller = new $controllerClass();

        $docId = $this->createDoc($controller, $refSupplierField);

        $subtotalLabel = 'Sub-total ' . uniqid();
        // qty=1 (not 0) for the same Propal quirk as testAddTitleLine.
        [$body, $code] = $controller->addLine([
            'id'           => $docId,
            'description'  => $subtotalLabel,
            'label'        => $subtotalLabel,
            'qty'          => 1,
            'subprice'     => 0,
            'tva_tx'       => 0,
            'product_type' => 9,
            'special_code' => 104,
        ]);
        $this->assertSame(201, $code, 'addLine sub-total must succeed: ' . json_encode($body));

        $lines = is_object($body) && isset($body->lines)
            ? $body->lines
            : (is_array($body) && isset($body['lines']) ? $body['lines'] : []);
        $this->assertNotEmpty($lines, 'document must have at least one line after adding a sub-total');

        $last = end($lines);
        $last = is_array($last) ? (object) $last : $last;
        $this->assertSame(9, (int) ($last->productType ?? $last->product_type ?? 0), 'sub-total line must carry product_type=9');
        $this->assertSame(104, (int) ($last->specialCode ?? $last->special_code ?? 0), 'sub-total line must carry special_code=104');
    }

    /**
     * Sentinel: assert that the line `id` exported by the mapper matches the
     * native Dolibarr `rowid` from the line table.
     *
     * Why this exists: smartauth commit 1545fc2 introduced a generic fallback
     * `$line->rowid ?? $line->id ?? null` inside dmTrait::exportMappedData()
     * to cope with Dolibarr line classes that populate $line->id but not
     * $line->rowid in fetch_lines() (the only confirmed offender today is
     * CommandeFournisseurLigne -- audit performed 2026-05-12 against
     * dolibarr/htdocs/{comm/propal,commande,compta/facture,fourn}/class/*.php).
     * The 4 other features (PropaleLigne / OrderLine / FactureLigne /
     * SupplierInvoiceLine) populate both fields, so the fallback is a safety
     * net rather than strictly required for them -- but it must remain
     * generic. This test verifies the contract holds end-to-end (controller
     * -> mapper -> exported id == native rowid) so a future refactor that
     * accidentally drops the fallback (or a future Dolibarr release that
     * tightens line objects) is caught immediately.
     *
     * @dataProvider controllerProvider
     */
    public function testLineIdMatchesNativeRowid(string $controllerClass, array $rights, ?string $refSupplierField, string $lineTable, string $lineFkColumn): void
    {
        $this->grantRights($rights);
        $controller = new $controllerClass();

        $docId = $this->createDoc($controller, $refSupplierField);

        // Add two lines so we can prove the mapping is stable per-line and
        // not coincidentally aligned with the first id-by-creation-order.
        [, $code1] = $controller->addLine([
            'id'           => $docId,
            'description'  => 'RowidQuirk line A ' . uniqid(),
            'qty'          => 1,
            'subprice'     => 10.0,
            'tva_tx'       => 20.0,
            'product_type' => 0,
        ]);
        $this->assertSame(201, $code1, 'first addLine must succeed');

        [$body, $code2] = $controller->addLine([
            'id'           => $docId,
            'description'  => 'RowidQuirk line B ' . uniqid(),
            'qty'          => 2,
            'subprice'     => 20.0,
            'tva_tx'       => 20.0,
            'product_type' => 0,
        ]);
        $this->assertSame(201, $code2, 'second addLine must succeed: ' . json_encode($body));

        // Read back the lines as exported by the mapper (this is what the
        // PWA sees via the JWT API).
        $lines = is_object($body) && isset($body->lines)
            ? $body->lines
            : (is_array($body) && isset($body['lines']) ? $body['lines'] : []);
        $this->assertCount(2, $lines, 'document must expose exactly two lines after two addLine calls');

        // Pull the native rowid set straight from the line table. The two
        // values are returned ASC by rowid so the order is deterministic.
        $sql = "SELECT rowid FROM " . MAIN_DB_PREFIX . $lineTable
            . " WHERE " . $lineFkColumn . " = " . (int) $docId
            . " ORDER BY rowid ASC";
        $resql = $this->db->query($sql);
        $this->assertNotFalse($resql, 'SQL probe must succeed on ' . MAIN_DB_PREFIX . $lineTable);

        $nativeRowids = [];
        while ($row = $this->db->fetch_object($resql)) {
            $nativeRowids[] = (int) $row->rowid;
        }
        $this->db->free($resql);

        $this->assertCount(2, $nativeRowids, 'SQL probe must return two rowids');

        // Lines are exported in fetch_lines() order (ORDER BY rang, then
        // rowid as a tiebreaker for equal rang); both addLines used the
        // default rang so the order matches insertion order.
        $exportedIds = array_map(function ($l) {
            $l = is_array($l) ? (object) $l : $l;
            return (int) ($l->id ?? 0);
        }, $lines);

        // Strictly compare: every exported id MUST be a positive integer
        // (no null, no 0) and MUST equal the corresponding native rowid.
        foreach ($exportedIds as $i => $id) {
            $this->assertGreaterThan(0, $id, "exported id at index $i must be > 0 (caught by smartauth rowid/id fallback)");
            $this->assertSame(
                $nativeRowids[$i],
                $id,
                "exported line id at index $i must equal native rowid (" . $lineTable . "): exported=$id native=" . $nativeRowids[$i]
            );
        }
    }

    /**
     * Helper: create a draft document, return its id. Matches the
     * minimum viable payload for each controller so the test focuses on
     * lines, not on header validation.
     */
    private function createDoc($controller, ?string $refSupplierField): int
    {
        $payload = [
            'fk_soc' => self::$socId,
            'socid'  => self::$socId,
            'datep'  => mktime(0, 0, 0, 6, 15, 2026),
            'datef'  => mktime(0, 0, 0, 6, 15, 2026),
            'date'   => mktime(0, 0, 0, 6, 15, 2026),
            'date_commande' => mktime(0, 0, 0, 6, 15, 2026),
        ];
        if ($refSupplierField !== null) {
            $payload[$refSupplierField] = 'TST-' . uniqid();
        }
        [$body, $code] = $controller->create($payload);
        $this->assertContains($code, [200, 201], 'create() must succeed for ' . get_class($controller) . ': ' . json_encode($body));

        $body = is_array($body) ? (object) $body : $body;
        $id = isset($body->id) ? (int) $body->id : (isset($body->rowid) ? (int) $body->rowid : 0);
        $this->assertGreaterThan(0, $id, 'create() must return a positive id');
        return $id;
    }

    private function latestLineId($docBody): int
    {
        $lines = is_object($docBody) && isset($docBody->lines)
            ? $docBody->lines
            : (is_array($docBody) && isset($docBody['lines']) ? $docBody['lines'] : []);
        if (empty($lines)) return 0;
        $last = end($lines);
        $last = is_array($last) ? (object) $last : $last;
        return (int) ($last->id ?? $last->rowid ?? 0);
    }

    private function grantRights(array $rights): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'propal', 'commande', 'facture', 'fournisseur', 'product', 'produit', 'service', 'stock', 'banque', 'projet'];
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

        foreach ($rights as $r) {
            [$obj, $sub, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $target = $user->rights->$obj;
            if ($sub !== null) {
                if (!isset($target->$sub)) {
                    $target->$sub = new \stdClass();
                }
                $target = $target->$sub;
            }
            $target->$perm = 1;
        }
    }
}
