<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * \file    dolipocket/admin/demo.php
 * \ingroup dolipocket
 * \brief   Hidden admin page: generate/purge the Dolipocket demo dataset.
 *
 * Not linked from any menu; opened directly by a tenant admin via its URL. Thin
 * UI on top of DolipocketDemoData (class/demodata.class.php), which holds all
 * the logic. Data is created in the current tenant entity ($conf->entity).
 */

// Load Dolibarr environment
$res = 0;
if (!$res && !empty($_SERVER["CONTEXT_DOCUMENT_ROOT"])) {
	$res = @include $_SERVER["CONTEXT_DOCUMENT_ROOT"]."/main.inc.php";
}
$tmp = empty($_SERVER['SCRIPT_FILENAME']) ? '' : $_SERVER['SCRIPT_FILENAME'];
$tmp2 = realpath(__FILE__);
$i = strlen($tmp) - 1;
$j = strlen($tmp2) - 1;
while ($i > 0 && $j > 0 && isset($tmp[$i]) && isset($tmp2[$j]) && $tmp[$i] == $tmp2[$j]) {
	$i--;
	$j--;
}
if (!$res && $i > 0 && file_exists(substr($tmp, 0, ($i + 1))."/main.inc.php")) {
	$res = @include substr($tmp, 0, ($i + 1))."/main.inc.php";
}
if (!$res && $i > 0 && file_exists(dirname(substr($tmp, 0, ($i + 1)))."/main.inc.php")) {
	$res = @include dirname(substr($tmp, 0, ($i + 1)))."/main.inc.php";
}
if (!$res && file_exists("../../main.inc.php")) {
	$res = @include "../../main.inc.php";
}
if (!$res && file_exists("../../../main.inc.php")) {
	$res = @include "../../../main.inc.php";
}
if (!$res) {
	die("Include of main fails");
}

global $langs, $user, $conf, $db;

// Libraries
require_once DOL_DOCUMENT_ROOT."/core/lib/admin.lib.php";
dol_include_once('/dolipocket/lib/dolipocket.lib.php');
dol_include_once('/dolipocket/class/demodata.class.php');

$langs->loadLangs(array("admin", "dolipocket@dolipocket"));

// Access control: admin only (this page is intentionally not in any menu).
if (!$user->admin) {
	accessforbidden();
}

$action  = GETPOST('action', 'aZ09');
$results = array();

$demo = new DolipocketDemoData($db);

// ---------------------------------------------------------------- ACTIONS
if ($action == 'generate' && $user->admin) {
	if (GETPOST('token', 'alpha') !== currentToken()) {
		accessforbidden('Bad token');
	}
	$out = $demo->generate($user);
	$results = $out['results'];
	if ($out['summary'] === 'already_installed') {
		setEventMessages('Le jeu de démonstration est déjà installé. Purgez-le avant de régénérer.', null, 'warnings');
	} elseif ($out['error'] > 0) {
		setEventMessages($out['error'].' erreur(s) critique(s) - données annulées', null, 'errors');
	} else {
		$c = $out['counts'];
		setEventMessages('Jeu de démonstration généré : '.$c['rayons'].' rayons, '.$c['products'].' produits, '.$c['warehouses'].' entrepôts, '.$c['stock_movements'].' mouvements de stock, '.$c['customers'].' clients, '.$c['suppliers'].' fournisseurs, '.$c['contacts'].' contacts, '.$c['proposals'].' devis, '.$c['orders'].' commandes, '.$c['invoices'].' factures, '.$c['supplier_orders'].' commandes fournisseur, '.$c['supplier_invoices'].' factures fournisseur, '.$c['supplier_proposals'].' demandes de prix, '.$c['agenda'].' évènements agenda, '.$c['shipments'].' expéditions, '.$c['receptions'].' réceptions, '.$c['projects'].' projets, '.$c['documents'].' documents, '.$c['images'].' images.'.($out['warnings'] ? ' ('.$out['warnings'].' avertissement(s))' : ''), null, 'mesgs');
	}
}

if ($action == 'purge' && $user->admin) {
	if (GETPOST('token', 'alpha') !== currentToken()) {
		accessforbidden('Bad token');
	}
	$out = $demo->purge($user);
	$results = $out['results'];
	setEventMessages('Purge effectuée : '.$out['nbProd'].' produits, '.$out['nbWarehouse'].' entrepôts, '.$out['nbStockMove'].' mouvements de stock, '.$out['nbDoc'].' documents, '.$out['nbCat'].' catégories, '.$out['nbSoc'].' tiers et '.$out['nbContact'].' contacts supprimés.', null, 'mesgs');
}


/*
 * View
 */

$title = 'Dolipocket - Jeu de démonstration';
llxHeader('', $title);

print load_fiche_titre($title, '', 'title_setup');

$isInstalled = $demo->isInstalled();

// Dataset summary (from the catalog file).
$catalogFile = dol_buildpath('/dolipocket/demo/data/catalog.php', 0);
$catalog = is_file($catalogFile) ? (require $catalogFile) : array('rayons' => array(), 'customers' => array(), 'suppliers' => array(), 'contacts' => array());
$nbRayons = count($catalog['rayons']);
$nbArticles = 0;
foreach ($catalog['rayons'] as $r) {
	$nbArticles += count($r['products']);
}
$nbCustomers = isset($catalog['customers']) ? count($catalog['customers']) : 0;
$nbSuppliers = isset($catalog['suppliers']) ? count($catalog['suppliers']) : 0;
$nbContacts = isset($catalog['contacts']) ? count($catalog['contacts']) : 0;

print '<div class="opacitymedium justify">';
print 'Page cachée réservée à l\'administrateur (non liée aux menus). Elle installe un jeu';
print ' de démonstration (thème épicerie / supérette) dans le tenant courant pour tester';
print ' rapidement Dolipocket : <strong>'.$nbRayons.' rayons</strong>,';
print ' <strong>'.$nbArticles.' articles</strong> avec photos et stock initial, <strong>'.count($catalog['warehouses'] ?? array()).' entrepôts</strong>, <strong>'.$nbCustomers.' clients</strong>,';
print ' <strong>'.$nbSuppliers.' fournisseurs</strong>, <strong>'.$nbContacts.' contacts</strong>,';
print ' <strong>'.DolipocketDemoData::PROPOSAL_COUNT.' devis</strong>,';
print ' <strong>'.DolipocketDemoData::ORDER_COUNT.' commandes</strong>,';
	print ' <strong>'.DolipocketDemoData::INVOICE_COUNT.' factures</strong>,';
	print ' <strong>'.DolipocketDemoData::SUPPLIER_ORDER_COUNT.' commandes fournisseur</strong> et';
	print ' <strong>'.DolipocketDemoData::SUPPLIER_INVOICE_COUNT.' factures fournisseur</strong> et';
	print ' <strong>'.DolipocketDemoData::SUPPLIER_PROPOSAL_COUNT.' demandes de prix</strong> et';
	print ' <strong>'.DolipocketDemoData::AGENDA_COUNT.' évènements agenda</strong> et';
	print ' <strong>'.DolipocketDemoData::SHIPMENT_COUNT.' expéditions</strong> et';
	print ' <strong>'.DolipocketDemoData::RECEPTION_COUNT.' réceptions</strong> et';
	print ' <strong>'.DolipocketDemoData::PROJECT_COUNT.' projets</strong> et des <strong>documents (GED)</strong> attachés à quelques tiers et factures.';
print '</div>';
print '<br>';

if ($isInstalled) {
	print info_admin('Jeu de démonstration actuellement installé dans cette entité.');
	print '<br>';
}

print '<div class="fichecenter">';
print '<table class="noborder centpercent">';
print '<tr class="liste_titre"><td>Action</td><td>Description</td><td class="right">&nbsp;</td></tr>';

// Generate row
print '<tr class="oddeven">';
print '<td class="nowrap"><strong>Générer</strong></td>';
print '<td>Crée les catégories, articles (avec photos), clients, fournisseurs, contacts, devis, commandes, factures, commandes fournisseur, factures fournisseur, demandes de prix, évènements agenda, expéditions, réceptions et projets de démonstration.'.($isInstalled ? ' <span style="color:#e67e22;">(déjà installé - purger d\'abord)</span>' : '').'</td>';
print '<td class="right">';
print '<form method="POST" action="'.$_SERVER["PHP_SELF"].'" style="display:inline;">';
print '<input type="hidden" name="token" value="'.newToken().'">';
print '<input type="hidden" name="action" value="generate">';
print '<input type="submit" class="button" value="Générer les données"'.($isInstalled ? ' disabled' : '').'>';
print '</form>';
print '</td>';
print '</tr>';

// Purge row
print '<tr class="oddeven">';
print '<td class="nowrap"><strong>Purger</strong></td>';
print '<td>Supprime tout le jeu de démonstration (devis, commandes, factures, commandes fournisseur, factures fournisseur, demandes de prix, évènements agenda, expéditions, réceptions, projets, articles préfixés '.DolipocketDemoData::PROD_REF_PREFIX.', rayons, clients, fournisseurs et contacts).</td>';
print '<td class="right">';
print '<form method="POST" action="'.$_SERVER["PHP_SELF"].'" style="display:inline;" onsubmit="return confirm(\'Supprimer définitivement tout le jeu de démonstration ?\');">';
print '<input type="hidden" name="token" value="'.newToken().'">';
print '<input type="hidden" name="action" value="purge">';
print '<input type="submit" class="button button-cancel" value="Purger les données">';
print '</form>';
print '</td>';
print '</tr>';

print '</table>';
print '</div>';

// Results of the last action.
if (!empty($results)) {
	print '<br>';
	print '<div class="fichecenter">';
	print '<table class="noborder centpercent">';
	print '<tr class="liste_titre"><td>Journal de l\'opération</td></tr>';
	foreach ($results as $msg) {
		if (strpos($msg, '[ERREUR]') !== false) {
			$style = 'color:#c0392b;font-weight:bold;';
		} elseif (strpos($msg, '[WARN]') !== false) {
			$style = 'color:#e67e22;';
		} else {
			$style = 'color:#27ae60;';
		}
		print '<tr class="oddeven"><td style="'.$style.'font-family:monospace;">'.dol_escape_htmltag($msg).'</td></tr>';
	}
	print '</table>';
	print '</div>';
}

llxFooter();
$db->close();
