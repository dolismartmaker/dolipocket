<?php
/**
 * test/mobile/backend/init.php
 *
 * One-shot CLI script that prepares the test Dolibarr instance for the
 * Playwright E2E suite:
 *
 *   1. Restore the pristine SQLite database from the vendor backup.
 *   2. Mount it at a stable path under /dev/shm so both this script (CLI)
 *      and the upcoming `php -S` instance hit the same file.
 *   3. Restore the real main.inc.php in case the PHPUnit HTTP suite left
 *      a shim in place (cf TESTING_PWA.md "Conflit shim main.inc.php").
 *   4. Bootstrap Dolibarr (master.inc.php) in CLI mode.
 *   5. Symlink the dolipocket module into htdocs/custom/ so php -S can
 *      serve /custom/dolipocket/pwa/api.php and /custom/dolipocket/public/.
 *   6. Activate modDolipocket via activateModule() (which cascades on its
 *      $depends, so modSmartauth and friends get init()ed too).
 *   7. Provision a test tenant (entity + admin user with a known password)
 *      via Dolipocket\Tenant\EntityProvisioner so the Blade login flow
 *      works end-to-end.
 *   8. Set DOLIPOCKET_PWA_URL so the post-login redirect points at the
 *      Vite preview running on the Playwright PWA port.
 *   9. Set MAIN_VERSION_LAST_INSTALL/UPGRADE so Dolibarr does not redirect
 *      every request to /install/.
 *  10. Write a JSON file with the test credentials and print its path on
 *      stdout so global-setup.js can pass it to the fixtures.
 *
 * Idempotent: safe to re-run. Existing test tenant is purged then recreated.
 */

// Mark CLI test mode early so any code that branches on PHPUNIT_RUNNING
// (typical for smartauth/smartmaker) skips its production-only side effects.
if (!defined('PHPUNIT_RUNNING')) {
    define('PHPUNIT_RUNNING', true);
}

$projectRoot = dirname(__DIR__, 3);
$sqliteVendorPath = $projectRoot . '/vendor/cap-rel/dolibarr-integration-sqlite';
if (!is_dir($sqliteVendorPath)) {
    fwrite(STDERR, "FATAL: cap-rel/dolibarr-integration-sqlite not installed. Run `composer install` at the project root first.\n");
    exit(2);
}
$dolibarrPath = realpath($sqliteVendorPath . '/htdocs');

// Stable SQLite location for the duration of the Playwright run. Use /dev/shm
// when available so concurrent reads/writes don't hit the real disk.
$dbDir = (is_dir('/dev/shm') ? '/dev/shm' : sys_get_temp_dir()) . '/dolipocket-pwa-e2e';
if (!is_dir($dbDir)) {
    @mkdir($dbDir, 0755, true);
}
$liveDbPath = $dbDir . '/database_dolibarr.sdb';

// Reset the live database from the pristine vendor copy so each run starts
// from a known state.
$pristineDbPath = $sqliteVendorPath . '/documents/database_dolibarr.sdb';
$backupDbPath = $sqliteVendorPath . '/documents/database_dolibarr.sdb.backup';
if (is_file($backupDbPath)) {
    // The PHPUnit integration suite is the canonical owner of the .backup -
    // it copies the pristine here once, then restores from it on every reset.
    copy($backupDbPath, $pristineDbPath);
} elseif (is_file($pristineDbPath)) {
    copy($pristineDbPath, $backupDbPath);
}
if (!is_file($pristineDbPath)) {
    fwrite(STDERR, "FATAL: pristine SQLite db not found at $pristineDbPath\n");
    exit(2);
}

// Drop any existing live DB / symlink, copy pristine -> live, then symlink the
// vendor location at live so Dolibarr (which reads $sqliteVendorPath/documents/
// database_dolibarr.sdb via conf.php) uses our live file.
if (is_link($pristineDbPath) || is_file($pristineDbPath)) {
    @unlink($pristineDbPath);
}
copy($backupDbPath, $liveDbPath);
if (!@symlink($liveDbPath, $pristineDbPath)) {
    // Symlink failed: fall back to copying. Live state will not be visible
    // from outside Dolibarr's connection, but the suite still works.
    copy($liveDbPath, $pristineDbPath);
    fwrite(STDERR, "WARN: symlink fallback to copy.\n");
}
fwrite(STDERR, "e2e: live DB at $liveDbPath\n");

// Restore the real main.inc.php in case the PHPUnit HTTP suite left a shim
// in place (it would redirect to a custom bootstrap that breaks ours).
$realMainPath = $dolibarrPath . '/main.inc.php';
$realMainBackup = $dolibarrPath . '/main.inc.php.real';
if (is_file($realMainBackup)) {
    copy($realMainBackup, $realMainPath);
    @unlink($realMainBackup);
    fwrite(STDERR, "e2e: restored real main.inc.php from leftover shim\n");
}

// Define Dolibarr CLI constants
foreach (['NOREQUIREMENU' => 1, 'NOREQUIREHTML' => 1, 'NOREQUIREAJAX' => 1, 'NOLOGIN' => 1, 'NOCSRFCHECK' => 1] as $k => $v) {
    if (!defined($k)) {
        define($k, $v);
    }
}

$_SERVER['PHP_SELF'] = '/test.php';
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['SCRIPT_NAME'] = '/test.php';
$_SERVER['SCRIPT_FILENAME'] = $dolibarrPath . '/test.php';
$_SERVER['REQUEST_URI'] = '/test.php';
$_SERVER['DOCUMENT_ROOT'] = $dolibarrPath;
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

$originalDir = getcwd();
chdir($dolibarrPath);

ob_start();
error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);

global $conf, $db, $user, $langs, $hookmanager, $mysoc;

require_once $projectRoot . '/vendor/autoload.php';
require_once $dolibarrPath . '/filefunc.inc.php';
require_once DOL_DOCUMENT_ROOT . '/master.inc.php';

error_reporting(E_ALL);
ob_end_clean();
chdir($originalDir);

if (!$db || !$user) {
    fwrite(STDERR, "FATAL: Dolibarr failed to initialize\n");
    exit(2);
}

// Load admin user (entity 1)
$user->fetch(1);
$admin = $user;

// Make sure MAIN_VERSION_LAST_INSTALL / _UPGRADE match runtime DOL_VERSION,
// otherwise main.inc.php redirects to /install/ on every web request.
$db->query(
    "REPLACE INTO " . MAIN_DB_PREFIX . "const(name, value, type, visible, note, entity)"
    . " VALUES('MAIN_VERSION_LAST_INSTALL', '" . $db->escape(DOL_VERSION) . "', 'chaine', 0, '', 0)"
);
$db->query(
    "REPLACE INTO " . MAIN_DB_PREFIX . "const(name, value, type, visible, note, entity)"
    . " VALUES('MAIN_VERSION_LAST_UPGRADE', '" . $db->escape(DOL_VERSION) . "', 'chaine', 0, '', 0)"
);

// Force the default backend language to French. master.inc.php initialises the
// per-request $langs from MAIN_LANG_DEFAULT of the default entity BEFORE the
// SmartAuth layer switches to the tenant entity, so without this the API
// translates field labels / menus in en_US (the SQLite base install default),
// while the PWA chrome is French. Pinning fr_FR here makes the whole app render
// French, matching production intent for a fr_FR tenant. (Test harness only.)
foreach ([0, 1] as $langEntity) {
    $db->query(
        "REPLACE INTO " . MAIN_DB_PREFIX . "const(name, value, type, visible, note, entity)"
        . " VALUES('MAIN_LANG_DEFAULT', 'fr_FR', 'chaine', 0, '', " . $langEntity . ")"
    );
}

// Symlink the dolipocket module into htdocs/custom/ so php -S can serve
// /custom/dolipocket/pwa/api.php and /custom/dolipocket/public/index.php.
$customDir = $dolibarrPath . '/custom';
if (!is_dir($customDir)) {
    @mkdir($customDir, 0755, true);
}
$symlinkTarget = $customDir . '/dolipocket';
if (is_link($symlinkTarget) || is_dir($symlinkTarget)) {
    if (is_link($symlinkTarget)) {
        @unlink($symlinkTarget);
    }
}
if (!file_exists($symlinkTarget)) {
    if (!@symlink($projectRoot, $symlinkTarget)) {
        fwrite(STDERR, "FATAL: cannot symlink $projectRoot -> $symlinkTarget\n");
        exit(2);
    }
}
fwrite(STDERR, "e2e: module symlink at $symlinkTarget\n");

// Deploy smartauth into htdocs/custom/ so activateModule() can resolve the
// modSmartauth dependency declared by modDolipocket. We try, in order:
//   1. SMARTAUTH_PATH env var (explicit override)
//   2. ~/dev/smartauth (sibling clone, used in dev workstations)
//   3. git clone of the public mirror (CI / fresh checkouts)
// The result is a smartauth/ folder (real or symlinked) under htdocs/custom/.
$smartauthTarget = $customDir . '/smartauth';
if (!file_exists($smartauthTarget)) {
    $envPath = getenv('SMARTAUTH_PATH');
    $sibling = (getenv('HOME') ?: '/root') . '/dev/smartauth';
    if ($envPath && is_dir($envPath . '/core/modules')) {
        @symlink($envPath, $smartauthTarget);
        fwrite(STDERR, "e2e: smartauth symlink (SMARTAUTH_PATH) -> $envPath\n");
    } elseif (is_dir($sibling . '/core/modules')) {
        @symlink($sibling, $smartauthTarget);
        fwrite(STDERR, "e2e: smartauth symlink (sibling) -> $sibling\n");
    } else {
        $url = getenv('SMARTAUTH_GIT_URL') ?: 'https://inligit.fr/cap-rel/dolibarr/plugin-smartauth.git';
        exec('GIT_TERMINAL_PROMPT=0 git clone --depth 1 ' . escapeshellarg($url) . ' ' . escapeshellarg($smartauthTarget) . ' 2>&1', $cloneOut, $cloneRc);
        if ($cloneRc !== 0 || !is_dir($smartauthTarget)) {
            fwrite(STDERR, "FATAL: smartauth deploy failed (rc=$cloneRc): " . implode("\n", $cloneOut) . "\n");
            exit(2);
        }
        // Pull composer deps so firebase/php-jwt is available.
        exec('composer install --no-dev --no-interaction --no-progress --working-dir=' . escapeshellarg($smartauthTarget) . ' 2>&1', $cIn, $cRc);
        if ($cRc !== 0) {
            fwrite(STDERR, "FATAL: smartauth composer install failed (rc=$cRc): " . implode("\n", $cIn) . "\n");
            exit(2);
        }
        fwrite(STDERR, "e2e: smartauth cloned into $smartauthTarget\n");
    }
}
if (!file_exists($smartauthTarget . '/core/modules/modSmartauth.class.php')) {
    fwrite(STDERR, "FATAL: smartauth deploy did not produce modSmartauth.class.php\n");
    exit(2);
}

// Register parent dir as alt0 so dol_buildpath() / dol_include_once() resolve
// /dolipocket/... to the symlinked module.
$parentDir = dirname($projectRoot);
if (!isset($conf->file->dol_document_root) || !is_array($conf->file->dol_document_root)) {
    $conf->file->dol_document_root = ['main' => DOL_DOCUMENT_ROOT];
}
$altIndex = 0;
while (isset($conf->file->dol_document_root['alt' . $altIndex])) {
    if ($conf->file->dol_document_root['alt' . $altIndex] === $parentDir) {
        break;
    }
    $altIndex++;
}
$conf->file->dol_document_root['alt' . $altIndex] = $parentDir;

// Pre-create $conf->dolipocket so addExtraField() and similar calls inside
// init() find a valid output dir.
if (!isset($conf->dolipocket)) {
    $conf->dolipocket = new stdClass();
}
$conf->dolipocket->enabled = 1;
$conf->dolipocket->dir_output = DOL_DATA_ROOT . '/dolipocket';
if (!is_dir($conf->dolipocket->dir_output)) {
    @mkdir($conf->dolipocket->dir_output, 0755, true);
}

// Activate modDolipocket via activateModule() so cascading dependencies
// (modSmartauth, modSociete, modProduct...) get their tables, constants and
// menus created. Calling init() directly skips $depends and breaks the API.
require_once $projectRoot . '/core/modules/modDolipocket.class.php';
require_once DOL_DOCUMENT_ROOT . '/core/lib/admin.lib.php';
$prevErr = error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);
$ret = activateModule('modDolipocket');
error_reporting($prevErr);
if (!empty($ret['errors'])) {
    fwrite(STDERR, 'FATAL: activateModule failed: ' . implode(' | ', $ret['errors']) . "\n");
    exit(2);
}
fwrite(STDERR, "e2e: modDolipocket activated (cascading deps)\n");

// Smartauth runtime tuning: disable rate limiter and seed a stable JWT key
// for entity 0. Per-entity DOLIPOCKET_JWT_KEY is generated lazily by
// smartmaker-api-prepend.php at first request, so we don't seed it here.
foreach (['SMARTAUTH_RATELIMIT_IP_MAX', 'SMARTAUTH_RATELIMIT_USER_MAX'] as $rl) {
    dolibarr_set_const($db, $rl, '10000', 'chaine', 0, '', 0);
}

// Allocate a test tenant via the production provisioner. The provisioner
// inserts a fresh entity, the minimal llx_const rows, the admin user with a
// password_hash() password, and the per-entity directory. This is exactly
// what /signup OTP runs in production.
require_once $projectRoot . '/src/Tenant/EntityProvisioner.php';

$testEmail = 'playwright@dolipocket.test';
$testPassword = 'PwTestPass2026!';
$testCompany = 'Playwright Test Co';

// Purge any existing test tenant so reruns start fresh. We delete the user
// and the tenant row; the entity-scoped llx_const rows are harmless leftovers.
$row = $db->query(
    "SELECT rowid, entity FROM " . MAIN_DB_PREFIX . "user"
    . " WHERE login = '" . $db->escape($testEmail) . "' LIMIT 1"
);
if ($row && $db->num_rows($row) > 0) {
    $obj = $db->fetch_object($row);
    $existingUserId = (int) $obj->rowid;
    $existingEntity = (int) $obj->entity;
    $db->query("DELETE FROM " . MAIN_DB_PREFIX . "user WHERE rowid = " . $existingUserId);
    $db->query("DELETE FROM " . MAIN_DB_PREFIX . "dolipocket_tenant WHERE entity = " . $existingEntity);
    fwrite(STDERR, "e2e: purged previous test tenant (user=$existingUserId entity=$existingEntity)\n");
}

$provisioner = new Dolipocket\Tenant\EntityProvisioner($db);
$result = $provisioner->provision([
    'email' => $testEmail,
    'company' => $testCompany,
    'password' => $testPassword,
    'tenantId' => 0,
]);
$testEntity = (int) $result['entity'];
$testUserId = (int) $result['userid'];

// Insert a tenant row in llx_dolipocket_tenant so the admin/listing pages
// have something to render and the user can be located by email -> entity.
$db->query(
    "INSERT INTO " . MAIN_DB_PREFIX . "dolipocket_tenant"
    . " (email, company, status, entity, fk_user_admin, date_creation)"
    . " VALUES ('" . $db->escape($testEmail) . "',"
    . " '" . $db->escape($testCompany) . "', 'active',"
    . " " . $testEntity . ", " . $testUserId . ","
    . " '" . $db->idate(dol_now()) . "')"
);
fwrite(STDERR, "e2e: provisioned test tenant entity=$testEntity userid=$testUserId\n");

// NB: module rights for the tenant admin are now granted by
// EntityProvisioner::grantAdminRights() (production code), so the harness no
// longer needs to activate modules / addrights itself. The only harness-only
// tweak left below is pinning the backend language (the SQLite base install
// defaults to en_US, whereas production tenants are fr_FR).

// Configure DOLIPOCKET_PWA_URL so the Blade login redirects to the Vite
// preview server (host + port). The PWA port lives in the env (default 5195
// per the docs/TESTING_PWA.md allocation table).
$pwaPort = (int) (getenv('DOLIPOCKET_TEST_PWA_PORT') ?: 5195);
$pwaUrl = 'http://127.0.0.1:' . $pwaPort;
dolibarr_set_const($db, 'DOLIPOCKET_PWA_URL', $pwaUrl, 'chaine', 0, '', 0);
fwrite(STDERR, "e2e: DOLIPOCKET_PWA_URL=$pwaUrl\n");

// Output JSON with everything the fixture needs.
$infoFile = $dbDir . '/backend-info.json';
$payload = [
    'docroot' => $dolibarrPath,
    'dbPath' => $liveDbPath,
    'projectRoot' => $projectRoot,
    'pwaUrl' => $pwaUrl,
    'testUser' => [
        'email' => $testEmail,
        'login' => $testEmail,
        'password' => $testPassword,
        'company' => $testCompany,
        'entity' => $testEntity,
        'userid' => $testUserId,
    ],
];
file_put_contents($infoFile, json_encode($payload, JSON_PRETTY_PRINT) . "\n");
echo $infoFile . "\n";
