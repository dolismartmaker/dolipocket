<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProposalController;
use Dolipocket\Api\OrderController;
use Dolipocket\Api\InvoiceController;
use Dolipocket\Api\SupplierOrderController;
use Dolipocket\Api\SupplierInvoiceController;
use Dolipocket\Api\Trait\PdfDownloadRegistry;

/**
 * Sentinel for the 5 PDF download endpoints (Proposal / Order / Invoice /
 * SupplierOrder / SupplierInvoice). Asserts that:
 *  - On success, the controller resolves last_main_doc, sanitises the
 *    filename, and emits the expected headers + body bytes.
 *  - An empty last_main_doc returns 404 with a clear "generate first" error.
 *  - An orphan path (last_main_doc set but file missing) returns 410.
 *  - A path-traversal attempt (last_main_doc forged outside DOL_DATA_ROOT)
 *    returns 422 and never streams the file.
 *  - A user without the 'lire' permission gets 403.
 *
 * The trait avoids hitting the network. Streaming is intercepted via
 * PdfDownloadRegistry::$skipExit so PHPUnit can inspect the captured
 * [body, code, headers] tuple instead of dying inside exit().
 */
class DocumentPdfDownloadTest extends DolibarrRealTestCase
{
    /** @var int Pivot thirdparty seeded once for the suite. */
    private static $socId;

    /** @var string Absolute path of the fake PDF that lives under DOL_DATA_ROOT. */
    private static $fakePdfPath;

    /** @var string Path used for the orphan / 410 test (file deleted on demand). */
    private static $orphanPdfPath;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/SendEmailTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaymentTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PdfDownloadTrait.php';
        foreach ([
            'dmProposal', 'dmOrder', 'dmInvoice', 'dmSupplierOrder', 'dmSupplierInvoice',
            'ProposalController', 'OrderController', 'InvoiceController',
            'SupplierOrderController', 'SupplierInvoiceController',
        ] as $f) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $f . '.php';
        }
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';

        $this->grantAllRights();

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'PdfDl-' . uniqid();
            $soc->client = 1;
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }

        if (self::$fakePdfPath === null) {
            $dataRoot = defined('DOL_DATA_ROOT')
                ? rtrim((string) DOL_DATA_ROOT, '/')
                : sys_get_temp_dir();
            if (!is_dir($dataRoot)) {
                @mkdir($dataRoot, 0777, true);
            }
            $dir = $dataRoot . '/dolipocket-pdfdl-test';
            @mkdir($dir, 0777, true);
            $path = $dir . '/fake-' . uniqid() . '.pdf';
            // Minimal but non-empty PDF body so we can assert on bytes.
            file_put_contents($path, "%PDF-1.4\n%Dolipocket-PDF-download-sentinel\n%%EOF\n");
            self::$fakePdfPath = $path;
            // Reserve a separate path for the orphan test; we'll touch then
            // delete it on demand inside the test method.
            self::$orphanPdfPath = $dir . '/orphan-' . uniqid() . '.pdf';
        }

        // Default: production-like (exit) -- each test that needs to
        // intercept streaming flips $skipExit individually.
        PdfDownloadRegistry::$skipExit = true;
        PdfDownloadRegistry::$lastResponse = null;
    }

    protected function tearDown(): void
    {
        PdfDownloadRegistry::$skipExit = false;
        PdfDownloadRegistry::$lastResponse = null;
        parent::tearDown();
    }

    /**
     * Promote the test user to admin and grant the necessary Dolibarr rights
     * so the controllers can fetch and read the documents.
     */
    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'propal', 'commande', 'facture', 'fournisseur'];
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

        foreach ([
            ['societe', null, 'lire'],
            ['societe', null, 'creer'],
            ['propal', null, 'lire'], ['propal', null, 'creer'],
            ['commande', null, 'lire'], ['commande', null, 'creer'],
            ['facture', null, 'lire'], ['facture', null, 'creer'],
            ['fournisseur', 'commande', 'lire'], ['fournisseur', 'commande', 'creer'],
            ['fournisseur', 'facture', 'lire'], ['fournisseur', 'facture', 'creer'],
        ] as $r) {
            [$obj, $sub, $perm] = $r;
            if (!isset($user->rights)) $user->rights = new \stdClass();
            if (!isset($user->rights->$obj)) $user->rights->$obj = new \stdClass();
            $target = $user->rights->$obj;
            if ($sub !== null) {
                if (!isset($target->$sub)) $target->$sub = new \stdClass();
                $target = $target->$sub;
            }
            $target->$perm = 1;
        }
    }

    /**
     * Helper: create a draft proposal, then pin last_main_doc on the DB row.
     * Returns the row id.
     */
    private function seedProposalWithPdf(string $pdfPath): int
    {
        global $db, $user;

        $controller = new ProposalController();
        [$body, $code] = $controller->create([
            'socid' => self::$socId,
            'datep' => time(),
        ]);
        $this->assertContains($code, [200, 201], 'create proposal: ' . json_encode($body));
        $docId = (int) (is_array($body) ? ($body['id'] ?? 0) : ($body->id ?? 0));
        $this->assertGreaterThan(0, $docId);

        // Pin last_main_doc on the persisted row.
        $sql = "UPDATE " . MAIN_DB_PREFIX . "propal SET last_main_doc = '" . $db->escape($pdfPath) . "'"
            . " WHERE rowid = " . $docId;
        $this->assertTrue((bool) $db->query($sql), 'pin last_main_doc: ' . $db->lasterror());

        return $docId;
    }

    public function testDownloadStreamsPdfWhenLastMainDocIsSet(): void
    {
        $docId = $this->seedProposalWithPdf(self::$fakePdfPath);

        $controller = new ProposalController();
        [$result, $code] = $controller->download(['id' => $docId]);

        $this->assertSame(200, $code, 'download must succeed: ' . json_encode($result));

        $captured = PdfDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured, 'streaming intercepted -- lastResponse must be set');
        $this->assertSame(200, $captured['code']);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
        $this->assertStringContainsString('attachment', $captured['headers']['Content-Disposition']);
        $this->assertStringEndsWith('.pdf"', $captured['headers']['Content-Disposition']);
        $this->assertSame(
            (string) filesize(self::$fakePdfPath),
            $captured['headers']['Content-Length']
        );
        $this->assertSame(file_get_contents(self::$fakePdfPath), $captured['body']);
        // The filename should be derived from the proposal ref (sanitised) +
        // ".pdf"; without an ADDON the ref may be empty -- we already
        // captured the .pdf suffix above. Just assert there is a filename.
        $this->assertNotEmpty($captured['filename']);
    }

    public function testDownloadReturns404WhenLastMainDocIsEmpty(): void
    {
        global $db;

        $controller = new ProposalController();
        [$body, $code] = $controller->create([
            'socid' => self::$socId,
            'datep' => time(),
        ]);
        $docId = (int) (is_array($body) ? ($body['id'] ?? 0) : ($body->id ?? 0));
        // Force last_main_doc to empty explicitly (it should already be
        // empty on a fresh draft, but we belt-and-brace it).
        $db->query("UPDATE " . MAIN_DB_PREFIX . "propal SET last_main_doc = '' WHERE rowid = " . $docId);

        [$result, $statusCode] = $controller->download(['id' => $docId]);
        $this->assertSame(404, $statusCode);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('No PDF', $result['error']);
        $this->assertNull(PdfDownloadRegistry::$lastResponse, 'must not have streamed any bytes');
    }

    public function testDownloadReturns410WhenFileIsMissingOnDisk(): void
    {
        // Reserve an orphan path: touch + delete so the parent directory
        // exists but the file itself is gone.
        @touch(self::$orphanPdfPath);
        $this->assertFileExists(self::$orphanPdfPath);
        unlink(self::$orphanPdfPath);
        $this->assertFileDoesNotExist(self::$orphanPdfPath);

        $docId = $this->seedProposalWithPdf(self::$orphanPdfPath);

        $controller = new ProposalController();
        [$result, $code] = $controller->download(['id' => $docId]);

        $this->assertSame(410, $code);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('no longer exists', $result['error']);
        $this->assertNull(PdfDownloadRegistry::$lastResponse);
    }

    public function testDownloadRejectsPathOutsideDataRoot(): void
    {
        // /etc/hostname exists on every Linux and is OUTSIDE DOL_DATA_ROOT.
        // Persist that forged path in last_main_doc and assert the trait
        // refuses to serve it. Two acceptable outcomes:
        //   - 422 if realpath() succeeded AND the prefix check kicks in.
        //   - 410 if realpath() of "$dataRoot/etc/hostname" returns false
        //     (e.g. when the data root is a chroot-like sandbox under
        //     /tmp). Both are SECURE: lastResponse stays null.
        $docId = $this->seedProposalWithPdf('/etc/hostname');

        $controller = new ProposalController();
        [$result, $code] = $controller->download(['id' => $docId]);

        $this->assertContains($code, [410, 422], 'must refuse out-of-root path');
        $this->assertArrayHasKey('error', $result);
        $this->assertNull(PdfDownloadRegistry::$lastResponse, '/etc/hostname must NEVER be streamed');
    }

    public function testDownloadReturns403WithoutLireRight(): void
    {
        global $user;

        $docId = $this->seedProposalWithPdf(self::$fakePdfPath);

        $user->admin = 0;
        $user->rights->propal->lire = 0;
        $user->rights->propal->creer = 0;

        $controller = new ProposalController();
        [$result, $code] = $controller->download(['id' => $docId]);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $result);
        $this->assertNull(PdfDownloadRegistry::$lastResponse);

        // Restore for subsequent tests.
        $user->admin = 1;
        $user->rights->propal->lire = 1;
        $user->rights->propal->creer = 1;
    }

    public function testDownloadReturns404OnUnknownId(): void
    {
        $controller = new ProposalController();
        [$result, $code] = $controller->download(['id' => 999999]);
        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $result);
    }

    public function testDownloadReturns400OnMissingId(): void
    {
        $controller = new ProposalController();
        [$result, $code] = $controller->download([]);
        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $result);
    }

    /**
     * One smoke test per controller proves the trait is wired identically on
     * the four remaining document types (objectClass + permGroup pairs).
     */
    public function testOrderDownloadStreamsCorrectly(): void
    {
        global $db, $user;
        $cmd = new \Commande($db);
        $cmd->socid = self::$socId;
        $cmd->date_commande = time();
        $r = $cmd->create($user);
        if ($r <= 0) {
            $this->markTestSkipped('Commande::create failed: ' . $cmd->error);
        }
        $db->query("UPDATE " . MAIN_DB_PREFIX . "commande SET last_main_doc = '" . $db->escape(self::$fakePdfPath) . "' WHERE rowid = " . (int) $r);

        $controller = new OrderController();
        [, $code] = $controller->download(['id' => (int) $r]);

        $this->assertSame(200, $code);
        $captured = PdfDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
    }

    public function testInvoiceDownloadStreamsCorrectly(): void
    {
        global $db, $user;
        $f = new \Facture($db);
        $f->socid = self::$socId;
        $f->date = time();
        $r = $f->create($user);
        if ($r <= 0) {
            $this->markTestSkipped('Facture::create failed: ' . $f->error);
        }
        $db->query("UPDATE " . MAIN_DB_PREFIX . "facture SET last_main_doc = '" . $db->escape(self::$fakePdfPath) . "' WHERE rowid = " . (int) $r);

        $controller = new InvoiceController();
        [, $code] = $controller->download(['id' => (int) $r]);

        $this->assertSame(200, $code);
        $captured = PdfDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
    }

    public function testSupplierOrderDownloadStreamsCorrectly(): void
    {
        global $db, $user;
        $cf = new \CommandeFournisseur($db);
        $cf->socid = self::$socId;
        $cf->date_commande = time();
        $r = $cf->create($user);
        if ($r <= 0) {
            $this->markTestSkipped('CommandeFournisseur::create failed: ' . $cf->error);
        }
        $db->query("UPDATE " . MAIN_DB_PREFIX . "commande_fournisseur SET last_main_doc = '" . $db->escape(self::$fakePdfPath) . "' WHERE rowid = " . (int) $r);

        $controller = new SupplierOrderController();
        [, $code] = $controller->download(['id' => (int) $r]);

        $this->assertSame(200, $code);
        $captured = PdfDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
    }

    public function testSupplierInvoiceDownloadStreamsCorrectly(): void
    {
        global $db, $user;
        $ff = new \FactureFournisseur($db);
        $ff->socid = self::$socId;
        $ff->date = time();
        $ff->libelle = 'SF-' . uniqid();
        $r = $ff->create($user);
        if ($r <= 0) {
            $this->markTestSkipped('FactureFournisseur::create failed: ' . $ff->error);
        }
        $db->query("UPDATE " . MAIN_DB_PREFIX . "facture_fourn SET last_main_doc = '" . $db->escape(self::$fakePdfPath) . "' WHERE rowid = " . (int) $r);

        $controller = new SupplierInvoiceController();
        [, $code] = $controller->download(['id' => (int) $r]);

        $this->assertSame(200, $code);
        $captured = PdfDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
    }
}
