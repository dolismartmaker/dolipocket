<?php

/**
 * Bootstrap for Dolipocket PHPUnit integration tests with real Dolibarr SQLite.
 *
 * Initializes a real Dolibarr environment via the cap-rel/dolibarr-integration-sqlite
 * package, then exposes $db, $user, $conf for the DolibarrRealTestCase base class.
 */

if (!defined('PHPUNIT_RUNNING')) {
    define('PHPUNIT_RUNNING', true);
}
if (!defined('PHPUNIT_TEST_MODE')) {
    define('PHPUNIT_TEST_MODE', true);
}

require_once dirname(__DIR__, 3) . '/vendor/autoload.php';

$sqliteVendorPath = dirname(__DIR__, 3) . '/vendor/cap-rel/dolibarr-integration-sqlite';
if (!is_dir($sqliteVendorPath)) {
    throw new RuntimeException(
        'cap-rel/dolibarr-integration-sqlite is not installed. ' .
        'Run: composer require --dev cap-rel/dolibarr-integration-sqlite:@dev'
    );
}
$sqliteVendorPath = realpath($sqliteVendorPath);

// Restore conf.php from template (in case a previous test crashed)
$confPath = $sqliteVendorPath . '/htdocs/conf/conf.php';
$confTemplate = $sqliteVendorPath . '/htdocs/conf/conf.php_sqlite';
if (file_exists($confTemplate)) {
    copy($confTemplate, $confPath);
}

// Use RAM disk for the SQLite database when available (performance)
$ramDiskPath = is_dir('/dev/shm') ? '/dev/shm' : sys_get_temp_dir();
$ramDbPath = $ramDiskPath . '/dolipocket_test_' . getmypid() . '.sdb';
$originalDbPath = $sqliteVendorPath . '/documents/database_dolibarr.sdb';
$backupDbPath = $originalDbPath . '.backup';

if (!file_exists($originalDbPath)) {
    throw new RuntimeException("Source SQLite database not found at: $originalDbPath");
}

// Restore the source database from the backup copy if available. We removed
// the previous "git checkout" branch because the vendor folder is rarely a
// real git checkout in CI / fresh installs, and copying from .backup is
// sufficient and predictable.
if (is_file($backupDbPath)) {
    copy($backupDbPath, $originalDbPath);
} elseif (is_file($originalDbPath)) {
    copy($originalDbPath, $backupDbPath);
}

if (is_file($originalDbPath)) {
    if (!file_exists($backupDbPath)) {
        copy($originalDbPath, $backupDbPath);
    }
    copy($originalDbPath, $ramDbPath);
    unlink($originalDbPath);
    symlink($ramDbPath, $originalDbPath);

    register_shutdown_function(function () use ($originalDbPath, $ramDbPath, $backupDbPath) {
        if (is_link($originalDbPath)) {
            unlink($originalDbPath);
        }
        if (file_exists($backupDbPath)) {
            copy($backupDbPath, $originalDbPath);
        }
        if (file_exists($ramDbPath)) {
            @unlink($ramDbPath);
        }
    });
}

if (!defined('DOL_DOCUMENT_ROOT')) {
    define('DOL_DOCUMENT_ROOT', $sqliteVendorPath . '/htdocs');
}

if (!defined('NOREQUIREMENU')) {
    define('NOREQUIREMENU', 1);
}
if (!defined('NOREQUIREHTML')) {
    define('NOREQUIREHTML', 1);
}
if (!defined('NOREQUIREAJAX')) {
    define('NOREQUIREAJAX', 1);
}
if (!defined('NOLOGIN')) {
    define('NOLOGIN', 1);
}
if (!defined('NOCSRFCHECK')) {
    define('NOCSRFCHECK', 1);
}

$_SERVER['PHP_SELF'] = '/test.php';
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['SCRIPT_NAME'] = '/test.php';
$_SERVER['SCRIPT_FILENAME'] = DOL_DOCUMENT_ROOT . '/test.php';
$_SERVER['REQUEST_URI'] = '/test.php';
$_SERVER['DOCUMENT_ROOT'] = DOL_DOCUMENT_ROOT;
$_SERVER['QUERY_STRING'] = '';
$_SERVER['REQUEST_METHOD'] = 'GET';

$originalDir = getcwd();
chdir(DOL_DOCUMENT_ROOT);

ob_start();
error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);

global $conf, $db, $user, $langs, $hookmanager, $mysoc;
require_once DOL_DOCUMENT_ROOT . '/filefunc.inc.php';
require_once DOL_DOCUMENT_ROOT . '/master.inc.php';

error_reporting(E_ALL);
ob_end_clean();
chdir($originalDir);

if (!$db || !$user) {
    throw new Exception('Dolibarr failed to initialize properly.');
}

// Load admin user
$user->fetch(1);

// Configure dol_document_root so dol_buildpath() can find module files.
$projectRoot = dirname(__DIR__, 3);
$parentDir = dirname($projectRoot);

if (!isset($conf->file->dol_document_root) || !is_array($conf->file->dol_document_root)) {
    $conf->file->dol_document_root = array('main' => DOL_DOCUMENT_ROOT);
}

// Create lowercase symlink for case-insensitive module path resolution.
$moduleName = strtolower(basename($projectRoot));
$symlinkPath = $parentDir . '/' . $moduleName;
if (!file_exists($symlinkPath) && basename($projectRoot) !== $moduleName) {
    @symlink($projectRoot, $symlinkPath);
    register_shutdown_function(function () use ($symlinkPath) {
        if (is_link($symlinkPath)) {
            @unlink($symlinkPath);
        }
    });
}

$conf->file->dol_document_root['alt0'] = $parentDir;

if (!isset($conf->dolipocket)) {
    $conf->dolipocket = new stdClass();
}
$conf->dolipocket->enabled = 1;
$conf->dolipocket->dir_output = DOL_DATA_ROOT . '/dolipocket';
if (!is_dir($conf->dolipocket->dir_output)) {
    @mkdir($conf->dolipocket->dir_output, 0755, true);
}

// Activate the module (cascading required modules: modSmartauth, etc.).
// Without this, integration tests that touch Dolipocket business tables
// (notably llx_dolipocket_tenant) would fail with "no such table". We rely
// on activateModule() to call init() on every dependency declared in
// $this->depends, which is precisely what production "click activate" does.
require_once $projectRoot . '/core/modules/modDolipocket.class.php';
require_once DOL_DOCUMENT_ROOT . '/core/lib/admin.lib.php';
$prevErr = error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);
$ret = activateModule('modDolipocket');
error_reporting($prevErr);
if (!empty($ret['errors'])) {
    throw new RuntimeException('activateModule failed in integration bootstrap: ' . implode(' | ', $ret['errors']));
}

// Sanity: verify module tables were created. This catches the case where
// activateModule() returned no error array but the SQL load was silently
// skipped (typically when path resolution failed).
$expectedTables = ['llx_dolipocket_tenant'];
foreach ($expectedTables as $t) {
    $resql = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='" . $db->escape($t) . "'");
    if (!$resql || $db->num_rows($resql) === 0) {
        throw new RuntimeException("Module init failed: table $t not created");
    }
}

// Load the test base class.
require_once __DIR__ . '/DolibarrRealTestCase.php';

fwrite(STDERR, "Dolipocket integration bootstrap loaded.\n");
fwrite(STDERR, 'DOL_DOCUMENT_ROOT: ' . DOL_DOCUMENT_ROOT . "\n");
