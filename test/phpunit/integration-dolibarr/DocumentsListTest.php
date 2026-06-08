<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\DocumentController;
use Dolipocket\Api\DocumentDownloadRegistry;
use Dolipocket\Api\ProposalController;

/**
 * Sentinel for the two new "task 4" endpoints :
 *   - GET /document?objectType=<t>&objectId=<n>  : list files attached to a
 *     Dolibarr object (Proposal, Order, Invoice, SupplierOrder,
 *     SupplierInvoice, ...). Returns metadata only.
 *   - GET /document/{id}/download                : stream a single ECM-
 *     indexed file. Permission gated by src_object_type, path-traversal
 *     guarded.
 *
 * The tests :
 *   - Seed a draft proposal + drop two fake PDFs in its document directory
 *     so the listing has something to find.
 *   - Assert the listing returns the expected metadata shape (filename,
 *     size, mime, ecm_id, share, object_type, object_id).
 *   - Assert filtering by (objectType, objectId) is honoured.
 *   - Assert that the download endpoint streams the correct bytes via
 *     DocumentDownloadRegistry::$skipExit interception.
 *   - Assert 400 on missing objectType / objectId.
 *   - Assert 403 when the caller has no 'lire' right on the underlying
 *     module.
 *   - Assert 410 when the ECM row points to a file that no longer exists.
 *   - Assert 422 when src_object_type forges a path outside DOL_DATA_ROOT.
 *
 * The streaming download is intercepted via $skipExit = true so PHPUnit can
 * inspect the captured [body, code, headers] tuple instead of being killed
 * by exit().
 */
class DocumentsListTest extends DolibarrRealTestCase
{
    /** @var int|null Pivot thirdparty seeded once for the suite. */
    private static $socId;

    /** @var string|null Absolute path of fake PDF #1 (under DOL_DATA_ROOT). */
    private static $pdfPath1;

    /** @var string|null Absolute path of fake PDF #2 (same dir as #1). */
    private static $pdfPath2;

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
        foreach ([
            'dmProposal',
            'ProposalController',
            'DocumentController',
        ] as $f) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $f . '.php';
        }
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        require_once DOL_DOCUMENT_ROOT . '/ecm/class/ecmfiles.class.php';

        $this->grantRights();

        // Sister tests (DocumentWorkflowTest in particular) leak a /tmp/...
        // dir_output for propal into the shared $conf. Reset to a path INSIDE
        // DOL_DATA_ROOT so our ecm_files filepath stays relative and the
        // controller's path-traversal guard does not accidentally reject our
        // seeded files.
        $entity = (int) ($this->conf->entity ?? 1);
        $dataRoot = defined('DOL_DATA_ROOT') ? rtrim((string) DOL_DATA_ROOT, '/') : sys_get_temp_dir();
        if (!isset($this->conf->propal) || !is_object($this->conf->propal)) {
            $this->conf->propal = new \stdClass();
        }
        $this->conf->propal->dir_output = $dataRoot . '/propale';
        $this->conf->propal->multidir_output = array($entity => $dataRoot . '/propale');
        @mkdir($this->conf->propal->dir_output, 0777, true);

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'DocList-' . uniqid();
            $soc->client = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('seed Societe failed: ' . $soc->error);
            }
            self::$socId = (int) $r;
        }

        // Reset registry for each test.
        DocumentDownloadRegistry::$skipExit = true;
        DocumentDownloadRegistry::$lastResponse = null;
    }

    protected function tearDown(): void
    {
        DocumentDownloadRegistry::$skipExit = false;
        DocumentDownloadRegistry::$lastResponse = null;
        parent::tearDown();
    }

    /**
     * Grant the rights expected by DocumentController::list (read 'lire' on
     * propal) and by the seeding proposal create (creer).
     */
    private function grantRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'propal'];
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
            ['societe', 'lire'], ['societe', 'creer'],
            ['propal',  'lire'], ['propal',  'creer'],
        ] as [$obj, $perm]) {
            if (!isset($user->rights)) {
                $user->rights = new \stdClass();
            }
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $user->rights->$obj->$perm = 1;
        }
    }

    /**
     * Helper : create a draft proposal, ensure its ref is set, then place
     * two fake PDFs in the directory the resolveObjectDir() path returns.
     * Also inserts matching llx_ecm_files rows for the listing to surface
     * ecm_id + share metadata.
     *
     * Returns the proposal id.
     */
    private function seedProposalWithTwoFiles(): int
    {
        global $db, $user, $conf;

        $controller = new ProposalController();
        [$body, $code] = $controller->create([
            'socid' => self::$socId,
            'datep' => time(),
        ]);
        $this->assertContains($code, [200, 201], 'create proposal: ' . json_encode($body));
        $proposalId = (int) (is_array($body) ? ($body['id'] ?? 0) : ($body->id ?? 0));
        $this->assertGreaterThan(0, $proposalId);

        // Reload the proposal to know its ref (the subdirectory is built from
        // dol_sanitizeFileName($obj->ref)).
        $propal = new \Propal($db);
        $this->assertGreaterThan(0, $propal->fetch($proposalId));

        // If the ADDON is not active (tests fixture), the auto-generated ref
        // may be empty. Pin an artificial ref so the directory resolution
        // works.
        $ref = $propal->ref;
        if ($ref === '' || $ref === null) {
            $ref = 'PR-TEST-' . $proposalId;
            $db->query("UPDATE " . MAIN_DB_PREFIX . "propal SET ref = '" . $db->escape($ref) . "' WHERE rowid = " . $proposalId);
            $propal->ref = $ref;
        }

        // Resolve the canonical directory using the same logic as
        // DocumentController : DOL_DATA_ROOT/propale/<sanitized ref>.
        $dataRoot = defined('DOL_DATA_ROOT') ? rtrim((string) DOL_DATA_ROOT, '/') : sys_get_temp_dir();
        $safeRef = function_exists('dol_sanitizeFileName') ? dol_sanitizeFileName($ref) : $ref;

        // Where does propal write ? Read conf->propal->dir_output / multidir.
        $base = '';
        if (isset($conf->propal) && is_object($conf->propal)) {
            if (isset($conf->propal->multidir_output[$conf->entity])
                && $conf->propal->multidir_output[$conf->entity] !== '') {
                $base = (string) $conf->propal->multidir_output[$conf->entity];
            } elseif (isset($conf->propal->dir_output) && $conf->propal->dir_output !== '') {
                $base = (string) $conf->propal->dir_output;
            }
        }
        if ($base === '') {
            // Last-resort fallback : sandbox under DOL_DATA_ROOT/propale.
            $base = $dataRoot . '/propale';
            // Configure $conf so the controller resolves the same path.
            if (!isset($conf->propal) || !is_object($conf->propal)) {
                $conf->propal = new \stdClass();
            }
            $conf->propal->dir_output = $base;
            $conf->propal->multidir_output = array($conf->entity => $base);
        }

        $dir = rtrim($base, '/') . '/' . $safeRef;
        // Clean any stale files left by previous runs (the directory layout is
        // shared with the Dolibarr fixture and a previous failing test could
        // have dropped extra PDFs here).
        if (is_dir($dir)) {
            $existing = @scandir($dir);
            if ($existing !== false) {
                foreach ($existing as $entry) {
                    if ($entry === '.' || $entry === '..') {
                        continue;
                    }
                    $path = $dir . '/' . $entry;
                    if (is_file($path)) {
                        @unlink($path);
                    }
                }
            }
        } else {
            @mkdir($dir, 0777, true);
        }
        $this->assertDirectoryExists($dir, 'proposal document directory must be writable');

        // Drop two fake files (one PDF, one text-as-binary).
        self::$pdfPath1 = $dir . '/devis-' . $proposalId . '.pdf';
        file_put_contents(self::$pdfPath1, "%PDF-1.4\n%Dolipocket-listing-test-1\n%%EOF\n");
        self::$pdfPath2 = $dir . '/note-' . $proposalId . '.pdf';
        file_put_contents(self::$pdfPath2, "%PDF-1.4\n%Dolipocket-listing-test-2\n%%EOF\n");

        // Build ecm_files entries (filepath relative to DOL_DATA_ROOT).
        $relPath = $dir;
        if (strpos($dir . '/', rtrim($dataRoot, '/') . '/') === 0) {
            $relPath = substr($dir, strlen(rtrim($dataRoot, '/') . '/'));
        }
        $relPath = rtrim($relPath, '/');

        foreach ([self::$pdfPath1, self::$pdfPath2] as $absPath) {
            $name = basename($absPath);
            $ecm = new \EcmFiles($db);
            $ecm->filename = $name;
            $ecm->filepath = $relPath;
            $ecm->fullpath_orig = $absPath;
            $ecm->entity = (int) $conf->entity;
            $ecm->src_object_type = 'propal';
            $ecm->src_object_id = $proposalId;
            $ecm->gen_or_uploaded = 'generated';
            $ecm->share = bin2hex(random_bytes(16));
            $ecm->date_c = dol_now();
            $ecm->label = md5_file($absPath);
            $r = $ecm->create($user);
            $this->assertGreaterThan(0, $r, 'EcmFiles create: ' . implode('; ', (array) $ecm->errors));
        }

        return $proposalId;
    }

    public function testListReturnsDocumentsWithMetadata(): void
    {
        $proposalId = $this->seedProposalWithTwoFiles();

        $controller = new DocumentController();
        [$body, $code] = $controller->list([
            'objectType' => 'proposal',
            'objectId'   => $proposalId,
        ]);

        $this->assertSame(200, $code, 'list must succeed: ' . json_encode($body));
        $this->assertIsArray($body);
        $this->assertSame('proposal', $body['object_type']);
        $this->assertSame($proposalId, $body['object_id']);
        $this->assertArrayHasKey('documents', $body);
        $this->assertCount(2, $body['documents'], 'expected exactly 2 files');

        // Each entry must expose the metadata shape consumed by the
        // <DocumentsSection> React component.
        foreach ($body['documents'] as $doc) {
            $this->assertArrayHasKey('ecm_id', $doc);
            $this->assertArrayHasKey('share', $doc);
            $this->assertArrayHasKey('filename', $doc);
            $this->assertArrayHasKey('size', $doc);
            $this->assertArrayHasKey('mime_type', $doc);
            $this->assertArrayHasKey('date_modification', $doc);
            $this->assertSame('proposal', $doc['object_type']);
            $this->assertSame($proposalId, $doc['object_id']);
            $this->assertGreaterThan(0, (int) $doc['ecm_id'], 'ecm_id should be hydrated from llx_ecm_files');
            $this->assertNotEmpty($doc['share'], 'share hash should be hydrated');
            $this->assertGreaterThan(0, (int) $doc['size']);
            $this->assertSame('application/pdf', $doc['mime_type']);
        }
    }

    public function testListAcceptsSnakeCaseAliases(): void
    {
        $proposalId = $this->seedProposalWithTwoFiles();

        $controller = new DocumentController();
        // PWA may submit either camelCase or snake_case form parameters.
        [$body, $code] = $controller->list([
            'object_type' => 'proposal',
            'object_id'   => $proposalId,
        ]);

        $this->assertSame(200, $code);
        $this->assertCount(2, $body['documents']);
    }

    public function testListRejectsInvalidObjectType(): void
    {
        $controller = new DocumentController();
        [$body, $code] = $controller->list([
            'objectType' => 'not-a-real-type',
            'objectId'   => 1,
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $body);
        $this->assertStringContainsString('Invalid objectType', $body['error']);
    }

    public function testListRejectsMissingObjectId(): void
    {
        $controller = new DocumentController();
        [$body, $code] = $controller->list([
            'objectType' => 'proposal',
            'objectId'   => 0,
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $body);
        $this->assertStringContainsString('Invalid objectId', $body['error']);
    }

    public function testListReturns404WhenObjectMissing(): void
    {
        $controller = new DocumentController();
        [$body, $code] = $controller->list([
            'objectType' => 'proposal',
            'objectId'   => 99999999,
        ]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $body);
    }

    public function testListReturns403WithoutReadRight(): void
    {
        $proposalId = $this->seedProposalWithTwoFiles();

        global $user;
        $user->admin = 0;
        // Strip 'lire' on propal so the read-permission helper returns false.
        $user->rights->propal->lire = 0;
        $user->rights->propal->creer = 0;

        try {
            $controller = new DocumentController();
            [$body, $code] = $controller->list([
                'objectType' => 'proposal',
                'objectId'   => $proposalId,
            ]);
            $this->assertSame(403, $code);
            $this->assertArrayHasKey('error', $body);
        } finally {
            // Restore for subsequent tests.
            $this->grantRights();
        }
    }

    public function testDownloadStreamsBinaryFromEcmId(): void
    {
        global $db;

        $proposalId = $this->seedProposalWithTwoFiles();

        // Pick the first ecm row for this proposal.
        $sql = 'SELECT rowid, filename FROM ' . MAIN_DB_PREFIX . "ecm_files"
            . " WHERE src_object_type = 'propal' AND src_object_id = " . $proposalId
            . ' ORDER BY rowid ASC LIMIT 1';
        $res = $db->query($sql);
        $row = $db->fetch_object($res);
        $this->assertNotNull($row, 'an ecm row must exist');
        $ecmId = (int) $row->rowid;
        $expectedName = (string) $row->filename;
        $db->free($res);

        $controller = new DocumentController();
        [$result, $code] = $controller->download(['id' => $ecmId]);

        $this->assertSame(200, $code, 'download must succeed: ' . json_encode($result));

        $captured = DocumentDownloadRegistry::$lastResponse;
        $this->assertNotNull($captured, 'streaming intercepted -- lastResponse must be set');
        $this->assertSame(200, $captured['code']);
        $this->assertSame('application/pdf', $captured['headers']['Content-Type']);
        $this->assertStringContainsString('attachment', $captured['headers']['Content-Disposition']);
        $this->assertStringContainsString($expectedName, $captured['headers']['Content-Disposition']);
        // The actual bytes must match the file we placed on disk.
        $this->assertSame(file_get_contents($captured['path']), $captured['body']);
    }

    public function testDownloadReturns404OnUnknownEcmId(): void
    {
        $controller = new DocumentController();
        [$result, $code] = $controller->download(['id' => 99999999]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $result);
        $this->assertNull(DocumentDownloadRegistry::$lastResponse);
    }

    public function testDownloadReturns400OnMissingId(): void
    {
        $controller = new DocumentController();
        [$result, $code] = $controller->download([]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $result);
        $this->assertNull(DocumentDownloadRegistry::$lastResponse);
    }

    public function testDownloadReturns410WhenFileMissingOnDisk(): void
    {
        global $db;

        $proposalId = $this->seedProposalWithTwoFiles();

        // Grab the second ecm row and delete its file on disk so realpath()
        // returns false / file is gone.
        $sql = 'SELECT rowid, filename, filepath FROM ' . MAIN_DB_PREFIX . "ecm_files"
            . " WHERE src_object_type = 'propal' AND src_object_id = " . $proposalId
            . ' ORDER BY rowid DESC LIMIT 1';
        $res = $db->query($sql);
        $row = $db->fetch_object($res);
        $this->assertNotNull($row);
        $ecmId = (int) $row->rowid;

        $diskPath = rtrim(DOL_DATA_ROOT, '/') . '/' . $row->filepath . '/' . $row->filename;
        $this->assertFileExists($diskPath);
        unlink($diskPath);

        $controller = new DocumentController();
        [$result, $code] = $controller->download(['id' => $ecmId]);

        $this->assertSame(410, $code);
        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('no longer exists', $result['error']);
        $this->assertNull(DocumentDownloadRegistry::$lastResponse);
    }

    public function testDownloadRejectsPathOutsideDataRoot(): void
    {
        global $db, $user, $conf;

        // Forge a directly-inserted ecm_files row pointing at /etc/hostname,
        // which exists on every Linux but is OUTSIDE DOL_DATA_ROOT. The
        // controller must refuse to serve it.
        $ecm = new \EcmFiles($db);
        $ecm->filename = 'hostname';
        $ecm->filepath = '/etc';
        $ecm->fullpath_orig = '/etc/hostname';
        $ecm->entity = (int) $conf->entity;
        $ecm->src_object_type = 'propal';
        $ecm->src_object_id = 1;
        $ecm->gen_or_uploaded = 'uploaded';
        $ecm->share = bin2hex(random_bytes(16));
        $ecm->date_c = dol_now();
        // label is NOT NULL in llx_ecm_files: use a placeholder md5.
        $ecm->label = md5('forged-test-row-' . microtime(true));
        $r = $ecm->create($user);
        $this->assertGreaterThan(0, $r, 'forge ecm row: ' . implode('; ', (array) $ecm->errors));

        $controller = new DocumentController();
        [$result, $code] = $controller->download(['id' => (int) $r]);

        // Either 422 (realpath succeeded + prefix check kicked in) or 410
        // (realpath returned false in a sandboxed test data root). Both are
        // SAFE outcomes : lastResponse must stay null.
        $this->assertContains($code, [410, 422], 'must refuse out-of-root path');
        $this->assertArrayHasKey('error', $result);
        $this->assertNull(DocumentDownloadRegistry::$lastResponse, '/etc/hostname must NEVER be streamed');
    }
}
