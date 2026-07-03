<?php

/**
 * Copyright (c) 2025 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * SmartMaker Configuration Page
 *
 * This page allows administrators to configure which extrafields
 * should be visible and/or editable in the SmartMaker mobile/web application.
 *
 * Configuration is stored in Dolibarr constants:
 * - DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RO : Read-only extrafields (comma-separated)
 * - DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RW : Read-write extrafields (comma-separated)
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

require_once DOL_DOCUMENT_ROOT.'/core/lib/admin.lib.php';
require_once DOL_DOCUMENT_ROOT.'/core/class/extrafields.class.php';
require_once DOL_DOCUMENT_ROOT.'/core/class/html.formsetup.class.php';
dol_include_once('/dolipocket/lib/dolipocket.lib.php');

// Load translations
$langs->loadLangs(array("admin", "dolipocket@dolipocket"));

// Access control
if (!$user->admin) {
    accessforbidden();
}

$action = GETPOST('action', 'aZ09');

/*
 * Actions
 */

// Using FormSetup, actions are handled automatically
// But we need to process the form if using manual approach

if ($action == 'update') {
    $error = 0;

    // Save read-only extrafields
    $extRO = GETPOST('DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RO', 'array');
    if (is_array($extRO)) {
        $value = implode(',', $extRO);
    } else {
        $value = '';
    }
    $res = dolibarr_set_const($db, 'DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RO', $value, 'chaine', 0, '', $conf->entity);
    if (!($res > 0)) {
        $error++;
    }

    // Save read-write extrafields
    $extRW = GETPOST('DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RW', 'array');
    if (is_array($extRW)) {
        $value = implode(',', $extRW);
    } else {
        $value = '';
    }
    $res = dolibarr_set_const($db, 'DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RW', $value, 'chaine', 0, '', $conf->entity);
    if (!($res > 0)) {
        $error++;
    }

    if (!$error) {
        setEventMessages($langs->trans("SetupSaved"), null, 'mesgs');
    } else {
        setEventMessages($langs->trans("Error"), null, 'errors');
    }
}

/*
 * View
 */

$page_name = "Dolipocket SmartMaker";
llxHeader('', $page_name);

// Warn when the companion SmartAuth module is missing / too old.
print dolipocket_check_smartauth_version();

// Configuration of extrafields for SmartMaker
// Customize the element name(s) below to match your module's objects

// Example: To configure extrafields for 'projet_task' and 'projet' objects,
// uncomment and adapt the following array:
// $elementsToConfig = array(
//     'projet_task' => 'Tasks',
//     'projet' => 'Projects',
// );

// Dolipocket exposes the following business objects to the PWA. Their extrafields
// can be flagged as visible (RO) or editable (RW) here.
$elementsToConfig = array(
    'societe'              => $langs->trans('ThirdParty'),
    'socpeople'            => $langs->trans('Contact'),
    'product'              => $langs->trans('Product'),
    'entrepot'             => $langs->trans('Warehouse'),
    'propal'               => $langs->trans('Proposal'),
    'commande'             => $langs->trans('Order'),
    'facture'              => $langs->trans('Invoice'),
    'commande_fournisseur' => $langs->trans('SupplierOrder'),
    'facture_fourn'        => $langs->trans('SupplierInvoice'),
    'actioncomm'           => $langs->trans('Agenda'),
);

// Subheader
$linkback = '<a href="'.($backtopage ? $backtopage : DOL_URL_ROOT.'/admin/modules.php?restore_lastsearch_values=1').'">'.$langs->trans("BackToModuleList").'</a>';

print load_fiche_titre($page_name, $linkback, 'title_setup');

// Setup tabs (if you have a tab library)
// $head = dolipocketAdminPrepareHead();
// print dol_get_fiche_head($head, 'smartmaker', $langs->trans("Module500000Name"), -1, 'dolipocket@dolipocket');

print '<form method="POST" action="'.$_SERVER["PHP_SELF"].'">';
print '<input type="hidden" name="token" value="'.newToken().'">';
print '<input type="hidden" name="action" value="update">';

if (empty($elementsToConfig)) {
    print '<div class="info">';
    print 'No extrafields configuration defined. Edit this file to add your module\'s objects to <code>$elementsToConfig</code>.';
    print '</div>';
} else {
    foreach ($elementsToConfig as $element => $elementLabel) {
        print '<div class="div-table-responsive">';
        print '<table class="noborder centpercent">';
        print '<tr class="liste_titre">';
        print '<td colspan="3">'.$elementLabel.' - '.$langs->trans("Extrafields").'</td>';
        print '</tr>';

        // Fetch extrafields for this element
        $extrafields = new ExtraFields($db);
        $extrafields->fetch_name_optionals_label($element);

        if (empty($extrafields->attributes[$element]['label'])) {
            print '<tr class="oddeven">';
            print '<td colspan="3">'.$langs->trans("NoExtrafieldsFound").'</td>';
            print '</tr>';
        } else {
            // Get current configuration
            $currentRO = explode(',', getDolGlobalString('DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RO'));
            $currentRW = explode(',', getDolGlobalString('DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RW'));

            print '<tr class="oddeven">';
            print '<td><strong>'.$langs->trans("Extrafield").'</strong></td>';
            print '<td class="center"><strong>'.$langs->trans("Visible").' (RO)</strong></td>';
            print '<td class="center"><strong>'.$langs->trans("Editable").' (RW)</strong></td>';
            print '</tr>';

            foreach ($extrafields->attributes[$element]['label'] as $key => $label) {
                $type = $extrafields->attributes[$element]['type'][$key];

                print '<tr class="oddeven">';
                print '<td>'.$label.' <span class="opacitymedium">('.$key.' - '.$type.')</span></td>';

                // Read-only checkbox
                $checked = in_array($key, $currentRO) ? ' checked' : '';
                print '<td class="center">';
                print '<input type="checkbox" name="DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RO[]" value="'.$key.'"'.$checked.'>';
                print '</td>';

                // Read-write checkbox
                $checked = in_array($key, $currentRW) ? ' checked' : '';
                print '<td class="center">';
                print '<input type="checkbox" name="DOLIPOCKET_SMARTMAKER_EXTRAFIELDS_RW[]" value="'.$key.'"'.$checked.'>';
                print '</td>';

                print '</tr>';
            }
        }

        print '</table>';
        print '</div>';
        print '<br>';
    }
}

print '<div class="center">';
print '<input type="submit" class="button button-save" value="'.$langs->trans("Save").'">';
print '</div>';

print '</form>';

// print dol_get_fiche_end();

llxFooter();
$db->close();
