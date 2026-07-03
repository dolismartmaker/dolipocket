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

    case 'create-proposal':
        // create-proposal <entity> <socid> [validate]
        // Seeds a proposal with one free-text line so the detail page renders
        // and a PDF has content. validate=1 mints a ref via the numbering
        // addon and moves it to the validated status.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        $propal = new Propal($db);
        $propal->socid = $socId;
        $propal->date = dol_now();
        $propal->datep = $propal->date;
        $propal->note_private = '[E2E] devis seed';
        $propal->entity = $entity;
        $r = $propal->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $propal->error ?? 'create_failed']);
        }
        $propal->addline('Prestation de test E2E', 100.0, 2, '20', 0, 0, 0, 0.0, 'HT', 0.0, 0, 0, -1, 0, 0, 0, 0, 'Prestation de test E2E', '', '', 0, null);
        if ($validate === 1) {
            if (empty($conf->global->PROPALE_ADDON)) {
                $conf->global->PROPALE_ADDON = 'mod_propale_marbre';
            }
            $propal->valid($user);
            $propal->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $propal->ref, 'status' => (int) $propal->statut]);
        // no break

    case 'create-order':
        // create-order <entity> <socid> [validate]
        // Seeds a customer order with one free-text line. validate=1 mints a
        // ref via the numbering addon and moves it to the validated status.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        $cmd = new Commande($db);
        $cmd->socid = $socId;
        $cmd->date = dol_now();
        $cmd->date_commande = $cmd->date;
        $cmd->note_private = '[E2E] commande seed';
        $cmd->entity = $entity;
        $r = $cmd->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $cmd->error ?? 'create_failed']);
        }
        // Commande::addline has a different argument order than Propal::addline.
        $cmd->addline('Prestation de test E2E', 100.0, 2, '20', 0, 0, 0, 0, 0, 0, 'HT', 0, '', '', 0, -1, 0, 0, null, 0, 'Prestation de test E2E', 0, null);
        if ($validate === 1) {
            if (empty($conf->global->COMMANDE_ADDON)) {
                $conf->global->COMMANDE_ADDON = 'mod_commande_marbre';
            }
            if (!isset($conf->commande) || !is_object($conf->commande)) {
                $conf->commande = new stdClass();
            }
            if (empty($conf->commande->multidir_output)) {
                $orderBaseDir = !empty($conf->commande->dir_output) ? $conf->commande->dir_output : DOL_DATA_ROOT . '/commande';
                $conf->commande->multidir_output = array($entity => $orderBaseDir);
            }
            $cmd->valid($user);
            $cmd->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $cmd->ref, 'status' => (int) $cmd->statut]);
        // no break

    case 'delete-order':
        $entity = (int) ($args[0] ?? 0);
        $ordId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $ordId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        $cmd = new Commande($db);
        if ($cmd->fetch($ordId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $cmd->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($cmd->error ?? 'unknown') : null]);
        // no break

    case 'create-supplier':
        // create-supplier <entity> <name>
        // Seeds a supplier (fournisseur) thirdparty for supplier-order /
        // supplier-invoice / reception specs.
        $entity = (int) ($args[0] ?? 0);
        $name = (string) ($args[1] ?? '');
        if ($entity <= 0 || $name === '') {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        $soc = new Societe($db);
        $soc->name = $name;
        $soc->fournisseur = 1;
        $soc->client = 0;
        $soc->status = 1;
        $soc->entity = $entity;
        $r = $soc->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $soc->error ?? 'create_failed']);
        }
        reply(['ok' => true, 'id' => (int) $r]);
        // no break

    case 'create-supplierorder':
        // create-supplierorder <entity> <socid> [validate]
        // Seeds a supplier order (CommandeFournisseur) with one free-text line.
        // validate=1 mints a ref via the numbering addon and validates it.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        $scmd = new CommandeFournisseur($db);
        $scmd->socid = $socId;
        $scmd->date = dol_now();
        $scmd->date_commande = $scmd->date;
        $scmd->note_private = '[E2E] supplier order seed';
        $scmd->entity = $entity;
        $r = $scmd->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $scmd->error ?? 'create_failed']);
        }
        $scmd->fetch_thirdparty();
        // CommandeFournisseur::addline has NO $label parameter and a distinct
        // argument order (type at position 13). Free-text line (fk_product=0).
        $scmd->addline('Prestation de test E2E', 100.0, 2, '20', 0.0, 0.0, 0, 0, '', 0.0, 'HT', 0.0, 0, 0, false, null, null, 0, null, 0, '', 0, -1, 0);
        if ($validate === 1) {
            if (empty($conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER)) {
                $conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER = 'mod_commande_fournisseur_muguet';
            }
            if (!isset($conf->fournisseur) || !is_object($conf->fournisseur)) {
                $conf->fournisseur = new stdClass();
            }
            if (!isset($conf->fournisseur->commande) || !is_object($conf->fournisseur->commande)) {
                $conf->fournisseur->commande = new stdClass();
            }
            if (empty($conf->fournisseur->commande->dir_output)) {
                $conf->fournisseur->commande->dir_output = DOL_DATA_ROOT . '/fournisseur/commande';
            }
            $scmd->valid($user);
            $scmd->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $scmd->ref, 'status' => (int) $scmd->statut]);
        // no break

    case 'delete-supplierorder':
        $entity = (int) ($args[0] ?? 0);
        $ordId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $ordId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        $scmd = new CommandeFournisseur($db);
        if ($scmd->fetch($ordId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $scmd->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($scmd->error ?? 'unknown') : null]);
        // no break

    case 'create-supplierinvoice':
        // create-supplierinvoice <entity> <socid> [validate]
        // Seeds a supplier invoice (FactureFournisseur) with one free-text line.
        // validate=1 mints a ref via the numbering addon and validates it.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';
        $sfac = new FactureFournisseur($db);
        $sfac->socid = $socId;
        $sfac->ref_supplier = 'E2E-FF-' . $entity . '-' . dol_print_date(dol_now(), '%Y%m%d%H%M%S');
        $sfac->type = FactureFournisseur::TYPE_STANDARD;
        $sfac->date = dol_now();
        $sfac->note_private = '[E2E] supplier invoice seed';
        $sfac->entity = $entity;
        $r = $sfac->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $sfac->error ?? 'create_failed']);
        }
        $sfac->fetch_thirdparty();
        // Defensive under PHP 8.2 strict: addline reads $this->special_code.
        $sfac->special_code = 0;
        // FactureFournisseur::addline has a UNIQUE 24-arg order: desc, pu, txtva,
        // localtax1, localtax2, qty, fk_product, ... type at pos 14, no label.
        $sfac->addline('Prestation de test E2E', 100.0, '20', 0, 0, 2, 0, 0, '', '', 0, 0, 'HT', 0, -1, 0, 0, null, 0, 0, '', '', 0, 0);
        if ($validate === 1) {
            if (empty($conf->global->INVOICE_SUPPLIER_ADDON_NUMBER)) {
                $conf->global->INVOICE_SUPPLIER_ADDON_NUMBER = 'mod_facture_fournisseur_cactus';
            }
            if (!isset($conf->fournisseur) || !is_object($conf->fournisseur)) {
                $conf->fournisseur = new stdClass();
            }
            if (!isset($conf->fournisseur->facture) || !is_object($conf->fournisseur->facture)) {
                $conf->fournisseur->facture = new stdClass();
            }
            if (empty($conf->fournisseur->facture->dir_output)) {
                $conf->fournisseur->facture->dir_output = DOL_DATA_ROOT . '/' . $entity . '/fournisseur/facture';
            }
            $sfac->validate($user);
            $sfac->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $sfac->ref, 'status' => (int) $sfac->statut]);
        // no break

    case 'delete-supplierinvoice':
        $entity = (int) ($args[0] ?? 0);
        $invId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $invId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';
        $sfac = new FactureFournisseur($db);
        if ($sfac->fetch($invId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $sfac->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($sfac->error ?? 'unknown') : null]);
        // no break

    case 'create-supplierproposal':
        // create-supplierproposal <entity> <socid> [validate]
        // Seeds a supplier price request (SupplierProposal) with one free-text
        // line. validate=1 mints a ref via the numbering addon and validates it.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/supplier_proposal/class/supplier_proposal.class.php';
        $sp = new SupplierProposal($db);
        $sp->socid = $socId;
        $sp->date = dol_now();
        $sp->note_private = '[E2E] supplier proposal seed';
        $sp->entity = $entity;
        $r = $sp->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $sp->error ?? 'create_failed']);
        }
        $sp->fetch_thirdparty();
        // SupplierProposal::addline (26 args): desc, pu_ht, qty, txtva, localtax1,
        // localtax2, fk_product, remise_percent, price_base_type, pu_ttc,
        // info_bits, type, rang, special_code, fk_parent_line, fk_fournprice,
        // pa_ht, label, array_options, ref_supplier, fk_unit, origin, origin_id,
        // pu_ht_devise, date_start, date_end. Free-text line (fk_product=0).
        $sp->addline('Prestation de test E2E', 100.0, 2, '20', 0, 0, 0, 0, 'HT', 0, 0, 0, -1, 0, 0, 0, 0, 'Prestation de test E2E', 0, '', '', '', 0, 0, 0, 0);
        if ($validate === 1) {
            if (empty($conf->global->SUPPLIER_PROPOSAL_ADDON)) {
                $conf->global->SUPPLIER_PROPOSAL_ADDON = 'mod_supplier_proposal_marbre';
            }
            if (empty($conf->supplier_proposal) || !is_object($conf->supplier_proposal)) {
                $conf->supplier_proposal = new stdClass();
            }
            if (empty($conf->supplier_proposal->dir_output)) {
                $conf->supplier_proposal->dir_output = DOL_DATA_ROOT . '/supplier_proposal';
            }
            $sp->valid($user);
            $sp->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $sp->ref, 'status' => (int) $sp->statut]);
        // no break

    case 'delete-supplierproposal':
        $entity = (int) ($args[0] ?? 0);
        $spId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $spId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/supplier_proposal/class/supplier_proposal.class.php';
        $sp = new SupplierProposal($db);
        if ($sp->fetch($spId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $sp->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($sp->error ?? 'unknown') : null]);
        // no break

    case 'create-agendaevent':
        // create-agendaevent <entity> [socid]
        // Seeds an agenda event (ActionComm). No lines, no PDF, no validate:
        // create() finalizes the ref (record id) in one call.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        if ($entity <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/comm/action/class/actioncomm.class.php';
        $evt = new ActionComm($db);
        $evt->type_code = 'AC_RDV';
        $evt->label = 'Rendez-vous E2E';
        $evt->datep = dol_now();
        $evt->datef = $evt->datep + 3600;
        $evt->userownerid = (int) $user->id;
        if ($socId > 0) {
            $evt->fk_soc = $socId;
        }
        $evt->note_private = '[E2E] agenda seed';
        $evt->entity = $entity;
        $r = $evt->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $evt->error ?? 'create_failed']);
        }
        reply(['ok' => true, 'id' => (int) $r, 'label' => (string) $evt->label]);
        // no break

    case 'delete-agendaevent':
        $entity = (int) ($args[0] ?? 0);
        $evtId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $evtId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/comm/action/class/actioncomm.class.php';
        $evt = new ActionComm($db);
        if ($evt->fetch($evtId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        // delete($notrigger=1): skip triggers during teardown.
        $r = $evt->delete(1);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($evt->error ?? 'unknown') : null]);
        // no break

    case 'create-shipment':
        // create-shipment <entity> <socid> [validate]
        // Expedition is origin-driven: create + validate a customer order with
        // one line, then build a shipment from it. validate=1 validates the
        // shipment too. Returns { ok, id, ref, status, orderId }.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/expedition/class/expedition.class.php';

        // 1) Origin order (validated, one free-text line).
        $cmd = new Commande($db);
        $cmd->socid = $socId;
        $cmd->date = dol_now();
        $cmd->date_commande = $cmd->date;
        $cmd->note_private = '[E2E] shipment origin order';
        $cmd->entity = $entity;
        $co = $cmd->create($user);
        if ($co <= 0) {
            reply(['ok' => false, 'error' => 'order_create_failed', 'detail' => $cmd->error]);
        }
        $cmd->addline('Prestation de test E2E', 100.0, 2, '20', 0, 0, 0, 0, 0, 0, 'HT', 0, '', '', 0, -1, 0, 0, null, 0, 'Prestation de test E2E', 0, null);
        if (empty($conf->global->COMMANDE_ADDON)) {
            $conf->global->COMMANDE_ADDON = 'mod_commande_marbre';
        }
        if (!isset($conf->commande) || !is_object($conf->commande)) {
            $conf->commande = new stdClass();
        }
        if (empty($conf->commande->multidir_output)) {
            $conf->commande->multidir_output = array($entity => DOL_DATA_ROOT . '/commande');
        }
        $cmd->valid($user);
        $cmd->fetch($co);
        $cmd->fetch_lines();

        // 2) Shipment from the order.
        if (empty($conf->global->EXPEDITION_ADDON_NUMBER)) {
            $conf->global->EXPEDITION_ADDON_NUMBER = 'mod_expedition_safor';
        }
        $conf->global->STOCK_WAREHOUSE_NOT_REQUIRED_FOR_SHIPMENTS = 1;
        if (!isset($conf->expedition) || !is_object($conf->expedition)) {
            $conf->expedition = new stdClass();
        }
        if (empty($conf->expedition->dir_output)) {
            $conf->expedition->dir_output = DOL_DATA_ROOT . '/expedition';
        }
        if (empty($conf->expedition->multidir_output)) {
            $conf->expedition->multidir_output = array($entity => $conf->expedition->dir_output);
        }
        $exp = new Expedition($db);
        $exp->origin = 'commande';
        $exp->origin_id = (int) $cmd->id;
        $exp->socid = (int) $cmd->socid;
        $exp->note_private = '[E2E] shipment seed';
        $exp->entity = $entity;
        // Defensive property init (PHP 8.2 strict reads them in create()).
        $exp->date_expedition = dol_now();
        $exp->date_delivery = 0;
        $exp->ref_customer = '';
        $exp->ref_ext = '';
        $exp->fk_project = 0;
        $exp->fk_delivery_address = 0;
        $exp->shipping_method_id = 0;
        $exp->tracking_number = '';
        $exp->weight = 0;
        $exp->sizeS = 0;
        $exp->sizeW = 0;
        $exp->sizeH = 0;
        $exp->weight_units = 0;
        $exp->size_units = 0;
        $exp->model_pdf = '';
        $exp->fk_incoterms = 0;
        $exp->location_incoterms = '';
        if (is_array($cmd->lines)) {
            foreach ($cmd->lines as $line) {
                $exp->addline(0, (int) $line->id, (float) $line->qty, 0);
            }
        }
        $ee = $exp->create($user);
        if ($ee <= 0) {
            reply(['ok' => false, 'error' => 'shipment_create_failed', 'detail' => $exp->error, 'orderId' => (int) $co]);
        }
        if ($validate === 1) {
            $exp->valid($user);
            $exp->fetch($ee);
        }
        reply(['ok' => true, 'id' => (int) $ee, 'ref' => (string) $exp->ref, 'status' => (int) $exp->statut, 'orderId' => (int) $co]);
        // no break

    case 'delete-shipment':
        $entity = (int) ($args[0] ?? 0);
        $shipId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $shipId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/expedition/class/expedition.class.php';
        $exp = new Expedition($db);
        if ($exp->fetch($shipId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        // delete($notrigger=1, $also_update_stock=false): uses the global $user.
        $r = $exp->delete(1, false);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($exp->error ?? 'unknown') : null]);
        // no break

    case 'create-reception':
        // create-reception <entity> <socid> [validate]
        // Reception is origin-driven: create a product, a validated supplier
        // order carrying a PRODUCT line (so Reception::fetch_lines can resolve
        // $line->product->label), then a reception from it. Returns
        // { ok, id, ref, status, orderId, productId }.
        $entity = (int) ($args[0] ?? 0);
        $socId = (int) ($args[1] ?? 0);
        $validate = (int) ($args[2] ?? 0);
        if ($entity <= 0 || $socId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/product/class/product.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.dispatch.class.php';
        require_once DOL_DOCUMENT_ROOT . '/reception/class/reception.class.php';

        // 1) A purchasable product for the order line.
        $prod = new Product($db);
        $prod->ref = 'E2E-REC-PROD-' . $entity . '-' . dol_print_date(dol_now(), '%Y%m%d%H%M%S');
        $prod->label = 'Produit E2E reception';
        $prod->type = Product::TYPE_PRODUCT;
        $prod->status = 1;
        $prod->status_buy = 1;
        $prod->price = 100;
        $prod->price_base_type = 'HT';
        $prod->tva_tx = 20;
        $prod->entity = $entity;
        $pid = $prod->create($user);
        if ($pid <= 0) {
            reply(['ok' => false, 'error' => 'product_create_failed', 'detail' => $prod->error]);
        }

        // 2) Validated supplier order carrying a product line.
        $scmd = new CommandeFournisseur($db);
        $scmd->socid = $socId;
        $scmd->date = dol_now();
        $scmd->date_commande = $scmd->date;
        $scmd->note_private = '[E2E] reception origin order';
        $scmd->entity = $entity;
        $co = $scmd->create($user);
        if ($co <= 0) {
            reply(['ok' => false, 'error' => 'order_create_failed', 'detail' => $scmd->error, 'productId' => (int) $pid]);
        }
        $scmd->fetch_thirdparty();
        $scmd->addline('Produit E2E reception', 100.0, 2, '20', 0.0, 0.0, (int) $pid, 0, '', 0.0, 'HT', 0.0, 0, 0, false, null, null, 0, null, 0, '', 0, -1, 0);
        if (empty($conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER)) {
            $conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER = 'mod_commande_fournisseur_muguet';
        }
        if (!isset($conf->fournisseur) || !is_object($conf->fournisseur)) {
            $conf->fournisseur = new stdClass();
        }
        if (!isset($conf->fournisseur->commande) || !is_object($conf->fournisseur->commande)) {
            $conf->fournisseur->commande = new stdClass();
        }
        if (empty($conf->fournisseur->commande->dir_output)) {
            $conf->fournisseur->commande->dir_output = DOL_DATA_ROOT . '/fournisseur/commande';
        }
        $scmd->valid($user);
        $scmd->fetch($co);
        $scmd->fetch_lines();

        // 3) Reception from the supplier order.
        if (empty($conf->global->RECEPTION_ADDON_NUMBER)) {
            $conf->global->RECEPTION_ADDON_NUMBER = 'mod_reception_beryl';
        }
        $conf->global->STOCK_WAREHOUSE_NOT_REQUIRED_FOR_RECEPTIONS = 1;
        if (!isset($conf->reception) || !is_object($conf->reception)) {
            $conf->reception = new stdClass();
        }
        if (empty($conf->reception->dir_output)) {
            $conf->reception->dir_output = DOL_DATA_ROOT . '/reception';
        }
        if (empty($conf->reception->multidir_output)) {
            $conf->reception->multidir_output = array($entity => $conf->reception->dir_output);
        }
        $rec = new Reception($db);
        $rec->origin = 'commande_fournisseur';
        $rec->origin_id = (int) $scmd->id;
        $rec->socid = (int) $scmd->socid;
        $rec->date_delivery = dol_now();
        $rec->note_private = '[E2E] reception seed';
        $rec->entity = $entity;
        // Defensive property init (PHP 8.2 strict reads them in create()).
        $rec->date_reception = dol_now();
        $rec->ref_supplier = '';
        $rec->fk_project = 0;
        $rec->shipping_method_id = 0;
        $rec->tracking_number = '';
        $rec->weight = 0;
        $rec->trueDepth = 0;
        $rec->trueWidth = 0;
        $rec->trueHeight = 0;
        $rec->weight_units = 0;
        $rec->size_units = 0;
        $rec->model_pdf = '';
        $rec->fk_incoterms = 0;
        $rec->location_incoterms = '';
        if (is_array($scmd->lines)) {
            foreach ($scmd->lines as $line) {
                $rec->addline(0, (int) $line->id, (float) $line->qty);
            }
        }
        $re = $rec->create($user);
        if ($re <= 0) {
            reply(['ok' => false, 'error' => 'reception_create_failed', 'detail' => $rec->error, 'orderId' => (int) $co, 'productId' => (int) $pid]);
        }
        if ($validate === 1) {
            $rec->valid($user);
            $rec->fetch($re);
        }
        reply(['ok' => true, 'id' => (int) $re, 'ref' => (string) $rec->ref, 'status' => (int) $rec->statut, 'orderId' => (int) $co, 'productId' => (int) $pid]);
        // no break

    case 'delete-reception':
        $entity = (int) ($args[0] ?? 0);
        $recId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $recId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.dispatch.class.php';
        require_once DOL_DOCUMENT_ROOT . '/reception/class/reception.class.php';
        $rec = new Reception($db);
        if ($rec->fetch($recId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $rec->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($rec->error ?? 'unknown') : null]);
        // no break

    case 'create-project':
        // create-project <entity> [validate]
        // Header-only object: Project::create() requires a non-empty ref + title.
        // validate=1 moves the project to the validated status via setValid().
        $entity = (int) ($args[0] ?? 0);
        $validate = (int) ($args[1] ?? 0);
        if ($entity <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/projet/class/project.class.php';
        if (!isset($conf->project) || !is_object($conf->project)) {
            $conf->project = new stdClass();
        }
        if (empty($conf->project->dir_output)) {
            $conf->project->dir_output = DOL_DATA_ROOT . '/project';
        }
        $proj = new Project($db);
        $proj->ref = 'E2E-PJ-' . $entity . '-' . dol_print_date(dol_now(), '%Y%m%d%H%M%S');
        $proj->title = 'Projet E2E';
        $proj->date_start = dol_now();
        $proj->note_private = '[E2E] project seed';
        $proj->statut = 0;
        // Public so the detail-page GET passes restrictedProjectArea() for a
        // user who is not the project lead / an assigned contact.
        $proj->public = 1;
        $proj->entity = $entity;
        $r = $proj->create($user);
        if ($r <= 0) {
            reply(['ok' => false, 'error' => $proj->error ?? 'create_failed']);
        }
        if ($validate === 1) {
            $proj->setValid($user);
            $proj->fetch($r);
        }
        reply(['ok' => true, 'id' => (int) $r, 'ref' => (string) $proj->ref, 'title' => (string) $proj->title, 'status' => (int) $proj->statut]);
        // no break

    case 'delete-project':
        $entity = (int) ($args[0] ?? 0);
        $projId = (int) ($args[1] ?? 0);
        if ($entity <= 0 || $projId <= 0) {
            reply(['ok' => false, 'error' => 'missing_args']);
        }
        $conf->entity = $entity;
        require_once DOL_DOCUMENT_ROOT . '/projet/class/project.class.php';
        $proj = new Project($db);
        if ($proj->fetch($projId) <= 0) {
            reply(['ok' => false, 'error' => 'not_found', 'deleted' => 0]);
        }
        $r = $proj->delete($user);
        reply(['ok' => $r > 0, 'deleted' => $r > 0 ? 1 : 0, 'error' => $r <= 0 ? ($proj->error ?? 'unknown') : null]);
        // no break

    default:
        reply(['ok' => false, 'error' => 'unknown_subcommand', 'subcommand' => $subcommand]);
}
