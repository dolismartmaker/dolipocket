<?php
/**
 * HTTP test router for Dolipocket admin and root pages.
 *
 * Used with: php -S 127.0.0.1:PORT -t $docRoot test/http/admin-router.php
 *
 * Responsibilities:
 *  1. Bootstrap a Dolibarr SQLite environment (in RAM) once per server process.
 *  2. Activate Dolipocket in $conf->modules and force admin rights for tests.
 *  3. Install a shim main.inc.php so admin/root pages find Dolibarr through
 *     the multi-try CONTEXT_DOCUMENT_ROOT path.
 *  4. Route /admin/x.php, /ajax/x.php and /x.php (root) to the corresponding
 *     module file, with cwd set to the file's directory for relative paths.
 *  5. Dump a PHPUNIT_FATAL_ERROR marker in the body if PHP encounters a fatal
 *     during the request.
 */

// Routing scope: this router covers admin/, ajax/ and module root only.
// public/ (Blade public site) and pwa/ (SmartMaker API entry-point) are
// excluded on purpose: they have their own bootstraps and would require
// a different test setup (Playwright for the PWA, dedicated Blade harness
// for the public site).

if (!defined('PHPUNIT_RUNNING')) {
    define('PHPUNIT_RUNNING', true);
}

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$requestPath = parse_url($requestUri, PHP_URL_PATH);

// Static asset bypass (server them directly via php -S)
if (preg_match('/\.(js|css|png|jpg|gif|ico|svg|woff2?|ttf|map)$/i', $requestPath)) {
    return false;
}

// Mark fatal errors in the body for assertNoPhpError() detection
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        echo "\n<!--PHPUNIT_FATAL_ERROR:" . $error['message'] . '-->';
    }
});

$projectRoot = dirname(__DIR__, 2);
$sqliteVendorPath = $projectRoot . '/vendor/cap-rel/dolibarr-integration-sqlite';
$dolibarrPath = realpath($sqliteVendorPath . '/htdocs');

// Health check endpoint (used by AdminPagesHttpTest::testAdminRouterPing)
if ($requestPath === '/ping') {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok']);
    return;
}

// ---------------------------------------------------------------
// One-time bootstrap of Dolibarr + module deployment
// ---------------------------------------------------------------
static $dbInitialized = false;

if (!$dbInitialized) {
    // Use RAM disk for the SQLite database (performance + isolation per pid)
    $ramDiskPath = is_dir('/dev/shm') ? '/dev/shm' : sys_get_temp_dir();
    $ramDbPath = $ramDiskPath . '/dolipocket_http_test_' . getmypid() . '.sdb';
    $originalDbPath = $sqliteVendorPath . '/documents/database_dolibarr.sdb';

    if (is_dir($sqliteVendorPath . '/.git')) {
        exec('cd ' . escapeshellarg($sqliteVendorPath) . ' && git checkout -- documents/database_dolibarr.sdb 2>/dev/null');
    }

    if (is_file($originalDbPath)) {
        if (!file_exists($originalDbPath . '.backup')) {
            copy($originalDbPath, $originalDbPath . '.backup');
        }
        copy($originalDbPath, $ramDbPath);
        unlink($originalDbPath);
        symlink($ramDbPath, $originalDbPath);

        register_shutdown_function(function () use ($originalDbPath, $ramDbPath) {
            if (is_link($originalDbPath)) {
                unlink($originalDbPath);
            }
            if (file_exists($originalDbPath . '.backup')) {
                copy($originalDbPath . '.backup', $originalDbPath);
                unlink($originalDbPath . '.backup');
            }
            if (file_exists($ramDbPath)) {
                unlink($ramDbPath);
            }
        });
    }

    require_once $projectRoot . '/vendor/autoload.php';

    // Only NOLOGIN and NOCSRFCHECK -- never NOREQUIREMENU/HTML/AJAX in
    // an admin router (they would prevent llxHeader and ajax helpers from
    // being loaded for all subsequent requests).
    if (!defined('NOLOGIN')) {
        define('NOLOGIN', 1);
    }
    if (!defined('NOCSRFCHECK')) {
        define('NOCSRFCHECK', 1);
    }

    $_SERVER['SCRIPT_FILENAME'] = $dolibarrPath . '/test.php';
    $_SERVER['DOCUMENT_ROOT'] = $dolibarrPath;

    $originalDir = getcwd();
    chdir($dolibarrPath);

    ob_start();
    error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);
    global $conf, $db, $user, $langs, $hookmanager, $mysoc;
    require_once $dolibarrPath . '/filefunc.inc.php';
    require_once DOL_DOCUMENT_ROOT . '/master.inc.php';
    error_reporting(E_ALL);
    ob_end_clean();

    chdir($originalDir);

    if (!$db || !$user) {
        http_response_code(500);
        echo json_encode(['error' => 'Dolibarr failed to initialize']);
        exit;
    }

    $user->fetch(1);

    // Make sure the DB-stored Dolibarr version matches the runtime version,
    // otherwise main.inc.php redirects to install/upgrade -- which would make
    // every test return 302 with an empty body.
    $sqlSetVersion = "REPLACE INTO " . MAIN_DB_PREFIX . "const(name, value, type, visible, note, entity) "
        . "VALUES('MAIN_VERSION_LAST_UPGRADE', '" . $db->escape(DOL_VERSION) . "', 'chaine', 0, '', 0)";
    $db->query($sqlSetVersion);
    $sqlSetInstall = "REPLACE INTO " . MAIN_DB_PREFIX . "const(name, value, type, visible, note, entity) "
        . "VALUES('MAIN_VERSION_LAST_INSTALL', '" . $db->escape(DOL_VERSION) . "', 'chaine', 0, '', 0)";
    $db->query($sqlSetInstall);
    if (!isset($conf->global) || !is_object($conf->global)) {
        $conf->global = new stdClass();
    }
    $conf->global->MAIN_VERSION_LAST_UPGRADE = DOL_VERSION;
    $conf->global->MAIN_VERSION_LAST_INSTALL = DOL_VERSION;

    // Register module path BEFORE init() so dol_include_once works
    $parentDir = dirname($projectRoot);
    if (!isset($conf->file->dol_document_root) || !is_array($conf->file->dol_document_root)) {
        $conf->file->dol_document_root = array('main' => DOL_DOCUMENT_ROOT);
    }
    $altIndex = 0;
    while (isset($conf->file->dol_document_root['alt' . $altIndex])) {
        if ($conf->file->dol_document_root['alt' . $altIndex] === $parentDir) {
            break;
        }
        $altIndex++;
    }
    $conf->file->dol_document_root['alt' . $altIndex] = $parentDir;

    // Deploy Dolipocket module via activateModule() so cascading dependencies
    // (modSmartauth, etc.) get their tables and constants created too. Calling
    // $mod->init() directly would skip the dependency cascade.
    $modFile = $projectRoot . '/core/modules/modDolipocket.class.php';
    require_once $modFile;
    require_once DOL_DOCUMENT_ROOT . '/core/lib/admin.lib.php';
    $previousErrorReporting = error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);
    $mod = new modDolipocket($db);
    $ret = activateModule('modDolipocket');
    error_reporting($previousErrorReporting);
    if (!empty($ret['errors'])) {
        throw new RuntimeException('activateModule failed: ' . implode(' | ', $ret['errors']));
    }

    // Enable module in $conf
    if (!isset($conf->dolipocket)) {
        $conf->dolipocket = new stdClass();
    }
    $conf->dolipocket->enabled = 1;
    $conf->dolipocket->dir_output = DOL_DATA_ROOT . '/dolipocket';
    if (!is_dir($conf->dolipocket->dir_output)) {
        @mkdir($conf->dolipocket->dir_output, 0755, true);
    }
    if (!isset($conf->modules)) {
        $conf->modules = array();
    }
    $conf->modules['dolipocket'] = 'dolipocket';

    // Seed minimal business data so admin/list pages exercise getLibStatut(),
    // getNomUrl() and column formatting on real rows. Without rows in base,
    // the per-row code paths are never reached, and typos hidden in those
    // methods would slip through the HTTP scan unnoticed.
    require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
    require_once DOL_DOCUMENT_ROOT . '/contact/class/contact.class.php';

    $soc = new Societe($db);
    $soc->name = 'Test Company HTTP';
    $soc->client = 1;
    $soc->status = 1;
    $soc->code_client = 'CT-HTTP-1';
    $soc->country_id = 1;
    $socId = $soc->create($user);
    if ($socId <= 0) {
        // Log the seed failure so a CI run keeps a trail of the cause.
        error_log('admin-router seed: Societe::create failed: ' . ($soc->error ?? ''));
    }

    if ($socId > 0) {
        $contact = new Contact($db);
        $contact->socid = $socId;
        $contact->lastname = 'TestHTTP';
        $contact->firstname = 'Demo';
        $contact->statut = 1;
        $contactId = $contact->create($user);
        if ($contactId <= 0) {
            error_log('admin-router seed: Contact::create failed: ' . ($contact->error ?? ''));
        }
    }

    // Insert one Dolipocket tenant row so admin pages that list tenants render
    // at least one line.
    $db->query(
        "INSERT INTO " . MAIN_DB_PREFIX . "dolipocket_tenant"
        . " (email, company, status, entity, date_creation)"
        . " VALUES ('test@dolipocket.local', 'Test Tenant', 'active', 2, '"
        . $db->idate(dol_now()) . "')"
    );

    // Build rights forcing code from the module descriptor so that the shim
    // grants every declared right at every request without manual maintenance.
    $rightsCode = '';
    if (!empty($mod->rights) && is_array($mod->rights)) {
        foreach ($mod->rights as $r) {
            $perm1 = $r[4] ?? '';
            $perm2 = $r[5] ?? '';
            if (!empty($perm1)) {
                $rightsCode .= 'if (!isset($user->rights->dolipocket->' . $perm1 . ')) { $user->rights->dolipocket->' . $perm1 . ' = new stdClass(); }' . "\n";
                if (!empty($perm2)) {
                    $rightsCode .= '$user->rights->dolipocket->' . $perm1 . '->' . $perm2 . ' = 1;' . "\n";
                } else {
                    $rightsCode .= '$user->rights->dolipocket->' . $perm1 . ' = 1;' . "\n";
                }
            }
        }
    }

    $shimContent = '<?php
// Shim main.inc.php for Dolipocket HTTP tests -- DO NOT EDIT

// Force prod mode BEFORE loading the real main.inc.php so its error handler
// is configured for prod mode. If set after, the real file has already
// captured $dolibarr_main_prod = "0" (the default) and silently swallows
// fatals -- defeating the point of HTTP tests.
$dolibarr_main_prod = "1";

require_once __DIR__ . "/main.inc.php.real";

// Register Dolipocket module path in dol_document_root
$parentDir = ' . var_export($parentDir, true) . ';
if (!isset($conf->file->dol_document_root) || !is_array($conf->file->dol_document_root)) {
    $conf->file->dol_document_root = array("main" => DOL_DOCUMENT_ROOT);
}
$altIndex = 0;
while (isset($conf->file->dol_document_root["alt" . $altIndex])) {
    if ($conf->file->dol_document_root["alt" . $altIndex] === $parentDir) {
        break;
    }
    $altIndex++;
}
$conf->file->dol_document_root["alt" . $altIndex] = $parentDir;

// Enable Dolipocket in $conf->modules (CRITICAL for isModEnabled())
if (!isset($conf->dolipocket)) {
    $conf->dolipocket = new stdClass();
}
$conf->dolipocket->enabled = 1;
if (!isset($conf->modules)) {
    $conf->modules = array();
}
$conf->modules["dolipocket"] = "dolipocket";

// Force user rights at EVERY inclusion (outside any static block)
global $user;
$user->admin = 1;
if (method_exists($user, "getrights")) {
    $user->getrights("dolipocket");
}
if (!isset($user->rights->dolipocket)) {
    $user->rights->dolipocket = new stdClass();
}
' . $rightsCode . '
// Bypass CSRF for POST tests: when the test sends token=test, force the
// session token so verifCond(GETPOST("token") == newToken()) passes.
if (!empty($_POST["token"]) && $_POST["token"] === "test") {
    $_SESSION["newtoken"] = "test";
    $_SESSION["token"] = "test";
}
';

    // Install the shim by renaming the real main.inc.php in place
    $realMainPath = $dolibarrPath . '/main.inc.php';
    $realMainBackup = $dolibarrPath . '/main.inc.php.real';
    if (!file_exists($realMainBackup)) {
        copy($realMainPath, $realMainBackup);
    }
    file_put_contents($realMainPath, $shimContent);

    // Note: do NOT register a shutdown function to clean up the shim --
    // built-in server runs shutdowns at the end of every request, which would
    // delete the shim before the next request arrives. tearDownAfterClass()
    // restores the real main.inc.php instead.

    $dbInitialized = true;
}

// ---------------------------------------------------------------
// Route the request to the matching module file
// ---------------------------------------------------------------
$targetFile = null;

if (preg_match('#^/admin/([a-zA-Z_]+\.php)$#', $requestPath, $matches)) {
    $targetFile = $projectRoot . '/admin/' . $matches[1];
} elseif (preg_match('#^/ajax/([a-zA-Z_]+\.php)$#', $requestPath, $matches)) {
    $targetFile = $projectRoot . '/ajax/' . $matches[1];
} elseif (preg_match('#^/([a-zA-Z_]+\.php)$#', $requestPath, $matches)) {
    $targetFile = $projectRoot . '/' . $matches[1];
}

if ($targetFile === null || !is_file($targetFile)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Not found', 'path' => $requestPath]);
    return;
}

// Set CONTEXT_DOCUMENT_ROOT so that the multi-try main.inc.php pattern in the
// admin/root page lands directly on our shim.
$_SERVER['CONTEXT_DOCUMENT_ROOT'] = $dolibarrPath;

if (!defined('NOCSRFCHECK')) {
    define('NOCSRFCHECK', 1);
}

// Change working directory to the Dolibarr htdocs path so that the relative
// require statements inside main.inc.php (e.g. require_once 'filefunc.inc.php')
// resolve correctly. The page itself is then included via its absolute path
// so its own relative paths still resolve from the dolibarr root, which is
// what production behaviour matches (production includes via main.inc.php).
chdir($dolibarrPath);

ob_start();
try {
    include $targetFile;
} catch (\Throwable $e) {
    echo "\n<!--PHPUNIT_FATAL_ERROR:" . $e->getMessage() . '-->';
}
$output = ob_get_clean();

echo $output;
