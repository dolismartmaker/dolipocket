<?php
/**
 * test/mobile/backend/invoice-actions.php
 *
 * CLI helper invoked by helpers/invoice.js wrappers from the invoice
 * Playwright spec. Kept SEPARATE from admin-actions.php on purpose so the
 * invoice E2E work never conflicts with concurrent edits to the shared
 * admin helper (e.g. the proposals track).
 *
 * Each subcommand boots Dolibarr against the same SQLite database that the
 * php -S backend uses, runs the action with real Dolibarr classes (so
 * triggers and business rules apply), and prints a single JSON line.
 *
 * Subcommands:
 *
 *   seed-invoices <entity> <count>
 *     Create one client thirdparty + one product, then <count> DRAFT
 *     customer invoices (Facture), each carrying a single product line.
 *     Returns { ok, socid, productId, invoices:[{id, ref}] }.
 *
 *   delete-invoice <entity> <id>
 *     Delete a Facture row. Returns { ok, deleted }.
 *
 *   count-invoices <entity>
 *     Count Facture rows for an entity. Returns { ok, count }.
 *
 *   get-invoice <entity> <id>
 *     Snapshot for assertions. Returns
 *     { ok, statut, paye, ref, lastMainDoc, totalTtc, nbLines }.
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

/**
 * Scope Dolibarr to the given tenant entity so created objects land there and
 * native `WHERE entity` filtering matches the running PWA backend.
 */
function scopeEntity($conf, $user, int $entity): void
{
    $conf->entity = $entity;
    $user->entity = $entity;
}

switch ($subcommand) {
    case 'seed-invoices':
        $entity = (int) ($args[0] ?? 0);
        $count = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $count <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        scopeEntity($conf, $user, $entity);

        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';

        // 1) A client thirdparty to attach the invoices to.
        $soc = new Societe($db);
        $soc->name = 'E2E Facture Client ' . $entity . '-' . dol_print_date(dol_now(), '%Y%m%d%H%M%S');
        $soc->client = 1;
        $soc->status = 1;
        $soc->entity = $entity;
        $socId = $soc->create($user);
        if ($socId <= 0) {
            reply(['ok' => false, 'error' => 'soc_create_failed', 'detail' => $soc->error]);
        }

        // 2) A sellable product used on every invoice line.
        $prod = new Product($db);
        $prod->ref = 'E2E-FAC-PROD-' . $entity . '-' . dol_print_date(dol_now(), '%Y%m%d%H%M%S');
        $prod->label = 'Produit E2E facture';
        $prod->type = Product::TYPE_PRODUCT;
        $prod->status = 1;      // on sale
        $prod->status_buy = 1;  // purchasable
        $prod->price = 100;
        $prod->price_base_type = 'HT';
        $prod->tva_tx = 20;
        $prod->entity = $entity;
        $prodId = $prod->create($user);
        if ($prodId <= 0) {
            reply(['ok' => false, 'error' => 'product_create_failed', 'detail' => $prod->error]);
        }

        // 3) N draft invoices, each with one product line (qty 2 @ 100 HT).
        $invoices = [];
        for ($i = 0; $i < $count; $i++) {
            $fac = new Facture($db);
            $fac->socid = $socId;
            $fac->date = dol_now();
            $fac->type = Facture::TYPE_STANDARD;
            $fac->entity = $entity;
            $facId = $fac->create($user);
            if ($facId <= 0) {
                reply(['ok' => false, 'error' => 'invoice_create_failed', 'index' => $i, 'detail' => $fac->error]);
            }
            $line = $fac->addline(
                'Ligne E2E ' . ($i + 1),
                100,   // pu_ht
                2,     // qty
                20,    // tva_tx
                0,     // localtax1
                0,     // localtax2
                $prodId
            );
            if ($line <= 0) {
                reply(['ok' => false, 'error' => 'addline_failed', 'index' => $i, 'detail' => $fac->error]);
            }
            // Re-fetch from DB (fresh object) and assert the line is durably
            // persisted before returning. Guards against any silent write loss
            // so seed.ok truly implies a line-carrying invoice.
            $check = new Facture($db);
            $check->fetch($facId);
            $check->fetch_lines();
            $nbLines = is_array($check->lines) ? count($check->lines) : 0;
            if ($nbLines < 1) {
                reply(['ok' => false, 'error' => 'line_not_persisted', 'index' => $i, 'invoiceId' => (int) $facId]);
            }
            $invoices[] = ['id' => (int) $facId, 'ref' => (string) $check->ref, 'nbLines' => $nbLines];
        }

        reply([
            'ok' => true,
            'socid' => (int) $socId,
            'socname' => (string) $soc->name,
            'productId' => (int) $prodId,
            'invoices' => $invoices,
        ]);
        // no break

    case 'delete-invoice':
        $entity = (int) ($args[0] ?? 0);
        $facId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $facId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        scopeEntity($conf, $user, $entity);
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        $fac = new Facture($db);
        if ($fac->fetch($facId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $fac->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($fac->error ?? 'unknown') : null]);
        // no break

    case 'count-invoices':
        $entity = (int) ($args[0] ?? 0);
        if ($entity <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $sql = "SELECT COUNT(*) AS n FROM " . MAIN_DB_PREFIX . "facture WHERE entity = " . $entity;
        $resql = $db->query($sql);
        if (!$resql) {
            reply(['ok' => false, 'error' => 'sql_error']);
        }
        $row = $db->fetch_object($resql);
        reply(['ok' => true, 'count' => (int) $row->n]);
        // no break

    case 'get-invoice':
        $entity = (int) ($args[0] ?? 0);
        $facId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $facId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        scopeEntity($conf, $user, $entity);
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        $fac = new Facture($db);
        if ($fac->fetch($facId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found']);
        }
        $fac->fetch_lines();
        reply([
            'ok' => true,
            'statut' => (int) $fac->statut,
            'paye' => (int) $fac->paye,
            'ref' => (string) $fac->ref,
            'lastMainDoc' => (string) ($fac->last_main_doc ?? ''),
            'totalTtc' => (float) $fac->total_ttc,
            'nbLines' => is_array($fac->lines) ? count($fac->lines) : 0,
        ]);
        // no break

    default:
        reply(['ok' => false, 'error' => 'unknown_subcommand', 'subcommand' => $subcommand]);
}
