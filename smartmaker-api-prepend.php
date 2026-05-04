<?php
/**
 * Copyright (c) 2025 Eric Seigne <eric.seigne@cap-rel.fr>
 * Copyright (c) 2025 Paolo Debaisieux <paolo.debaisieux@cap-rel.fr>
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

// ************************  DOLIBARR STUFF ************************ //

if (!defined('NOCSRFCHECK')) {
    define('NOCSRFCHECK', '1'); // Do not check anti CSRF attack test
}
if (!defined('NOTOKENRENEWAL')) {
    define('NOTOKENRENEWAL', '1'); // Do not check anti POST attack test
}
if (!defined("NOLOGIN")) {
    define("NOLOGIN", '1'); // If this page is public (can be called outside logged session)
}
if (!defined("NOSESSION")) {
    define("NOSESSION", '1');
}

// Load Dolibarr environment
$res = 0;
// Try main.inc.php into web root known defined into CONTEXT_DOCUMENT_ROOT (not always defined)
if (!$res && !empty($_SERVER["CONTEXT_DOCUMENT_ROOT"])) {
    $res = @include $_SERVER["CONTEXT_DOCUMENT_ROOT"]."/main.inc.php";
}
// Try main.inc.php into web root detected using web root calculated from SCRIPT_FILENAME
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
// Try main.inc.php using relative path
if (!$res && file_exists("../main.inc.php")) {
    $res = @include "../main.inc.php";
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

// ************************  Dolipocket COMPOSER AUTOLOAD ************************ //
// Required for Dolipocket\Api\* classes (controllers + mappers in smartmaker-api/)
// to be findable by the SmartAuth route dispatcher. composer.json maps the
// Dolipocket\\Api\\ namespace to smartmaker-api/ via PSR-4, but only the
// vendor/autoload.php loader knows about that mapping. Without this require,
// SmartAuth fails with "Class (Dolipocket\Api\ThirdPartyController) not found"
// on every protected route.
$dpkVendorAutoload = __DIR__.'/vendor/autoload.php';
if (is_file($dpkVendorAutoload)) {
    require_once $dpkVendorAutoload;
} else {
    dol_syslog("DPK smartmaker-api-prepend: vendor/autoload.php missing -- run composer install in ".__DIR__, LOG_ERR);
}

// ************************  SmartAuth STUFF ************************ //

dol_include_once('/smartauth/autoload.php');

// get informations about current module
dol_include_once('/dolipocket/core/modules/modDolipocket.class.php');
$tmpmodule = new \modDolipocket($db);

//very important to smartAuth stack
$smartAuthAppID = $tmpmodule->numero;

// JWT key is per-entity so a token signed for tenant A cannot validate on tenant B.
$smartAuthAppKey = trim(getDolGlobalString('DOLIPOCKET_JWT_KEY'));
if (empty($smartAuthAppKey)) {
    $smartAuthAppKey = bin2hex(random_bytes(32));
    if (dolibarr_set_const($db, 'DOLIPOCKET_JWT_KEY', $smartAuthAppKey, 'chaine', 0, '', $conf->entity) < 0) {
        dol_syslog("DPK smartmaker-api-prepend: failed to persist DOLIPOCKET_JWT_KEY for entity ".$conf->entity, LOG_ERR);
    }
}

// PSR-4 autoload for Dolipocket\Api\ is loaded above via require_once
// __DIR__.'/vendor/autoload.php'. composer.json declares the mapping
// Dolipocket\\Api\\ => smartmaker-api/. Run `composer dump-autoload` after
// pulling new controllers into smartmaker-api/ so the optimised classmap is
// regenerated (otherwise newly added controllers will not be found).
