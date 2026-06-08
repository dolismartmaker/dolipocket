<?php
/**
 * test/mobile/backend/admin-actions.php
 *
 * CLI helper invoked by helpers/admin.js wrappers from the Playwright specs.
 * Each subcommand boots Dolibarr against the same SQLite database that the
 * php -S backend uses, executes the action with real Dolibarr classes
 * (so triggers and business rules apply), and prints a single JSON line.
 *
 * Subcommands:
 *
 *   delete-thirdparty <entity> <socid>
 *     Delete a Societe row. Returns { ok, deleted }.
 *
 *   count-thirdparties <entity>
 *     Count Societe rows for an entity. Returns { ok, count }.
 *
 * Output: a single JSON object on stdout. Stderr may carry Dolibarr warnings.
 */

if (!defined('PHPUNIT_RUNNING')) {
    define('PHPUNIT_RUNNING', true);
}

$argvCopy = $argv;
array_shift($argvCopy); // drop script name
$subcommand = $argvCopy[0] ?? '';
array_shift($argvCopy);
$args = $argvCopy;

$projectRoot = dirname(__DIR__, 3);
$sqliteVendorPath = $projectRoot . '/vendor/cap-rel/dolibarr-integration-sqlite';
$dolibarrPath = realpath($sqliteVendorPath . '/htdocs');

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

global $conf, $db, $user, $langs, $mysoc;
require_once $projectRoot . '/vendor/autoload.php';
require_once $dolibarrPath . '/filefunc.inc.php';
require_once DOL_DOCUMENT_ROOT . '/master.inc.php';

error_reporting(E_ALL);
ob_end_clean();
chdir($originalDir);

if (!$db || !$user) {
    fwrite(STDERR, "FATAL: Dolibarr failed to initialize\n");
    echo json_encode(['ok' => false, 'error' => 'bootstrap_failed']) . "\n";
    exit(2);
}

$user->fetch(1);
$user->admin = 1;

function reply(array $data): void
{
    echo json_encode($data) . "\n";
    exit;
}

switch ($subcommand) {
    case 'delete-thirdparty':
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        $soc = new Societe($db);
        if ($soc->fetch($socId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $soc->delete($socId, $user, 1);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($soc->error ?? 'unknown') : null]);
        // no break

    case 'count-thirdparties':
        $entity = (int) ($args[0] ?? 0);
        if ($entity <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $sql = "SELECT COUNT(*) AS n FROM " . MAIN_DB_PREFIX . "societe WHERE entity = " . $entity;
        $resql = $db->query($sql);
        if (!$resql) {
            reply(['ok' => false, 'error' => 'sql_error']);
        }
        $row = $db->fetch_object($resql);
        reply(['ok' => true, 'count' => (int) $row->n]);
        // no break

    case 'create-thirdparty':
        $entity = (int) ($args[0] ?? 0);
        $name = (string) ($args[1] ?? '');
        if ($entity <= 0 || $name === '') {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        $soc = new Societe($db);
        $soc->name = $name;
        $soc->client = 1;
        $soc->status = 1;
        $soc->entity = $entity;
        $r = $soc->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $soc->error ?? 'create_failed']);
        }
        reply(['ok' => true, 'id' => (int) $r]);
        // no break

    case 'delete-proposal':
        $entity = (int) ($args[0] ?? 0);
        $propId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $propId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        $propal = new Propal($db);
        if ($propal->fetch($propId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $propal->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($propal->error ?? 'unknown') : null]);
        // no break

    default:
        reply(['ok' => false, 'error' => 'unknown_subcommand', 'subcommand' => $subcommand]);
}
