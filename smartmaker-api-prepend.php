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

// Dev-mode opcache invalidation. When the Dolibarr admin sets
// DOLIPOCKET_DEV_MODE=1, every request invalidates opcache for the
// Dolipocket smartmaker-api/ tree + the smartauth dolMapping/ tree, so
// changes to mappers and the SmartAuth helper take effect on the very next
// request -- no php-fpm restart required.
//
// Cost: ~one stat() per cached file, only when opcache is loaded. Negligible
// for the ~20 files in scope. Disabled by default so prod is unaffected.
if (getDolGlobalString('DOLIPOCKET_DEV_MODE') === '1' && function_exists('opcache_invalidate')) {
    $dpkRoots = [
        __DIR__.'/smartmaker-api',
        __DIR__.'/class',
        __DIR__.'/src',
    ];
    $smartauthRoot = realpath(DOL_DOCUMENT_ROOT.'/custom/smartauth/dolMapping');
    if ($smartauthRoot !== false) {
        $dpkRoots[] = $smartauthRoot;
    }
    // Use a custom recursive walk that resolves realpath() at each step and
    // skips already-visited inodes. Without this guard, a project that
    // contains a symlink pointing back into its own tree (typical when
    // smartauth/dolibarr-integration-sqlite test fixtures expose a
    // .../htdocs/custom/dolipocket -> /home/.../dolipocket loop) blows up
    // with "Too many levels of symbolic links". Iterating ourselves is
    // also faster than RecursiveDirectoryIterator on small trees.
    $visited = [];
    $walk = function ($dir) use (&$walk, &$visited) {
        $real = @realpath($dir);
        if ($real === false || isset($visited[$real])) return;
        $visited[$real] = true;
        $entries = @scandir($real);
        if ($entries === false) return;
        foreach ($entries as $e) {
            if ($e === '.' || $e === '..') continue;
            $path = $real . DIRECTORY_SEPARATOR . $e;
            if (is_link($path)) continue; // never follow symlinks
            if (is_dir($path)) {
                // Skip vendor/ and node_modules/ -- they are large and not
                // mutated by Dolipocket development.
                if ($e === 'vendor' || $e === 'node_modules') continue;
                $walk($path);
            } elseif (is_file($path) && substr($e, -4) === '.php') {
                @opcache_invalidate($path, true);
            }
        }
    };
    foreach ($dpkRoots as $root) {
        if (is_dir($root)) {
            $walk($root);
        }
    }
    clearstatcache(true);
}

// get informations about current module
dol_include_once('/dolipocket/core/modules/modDolipocket.class.php');
$tmpmodule = new \modDolipocket($db);

//very important to smartAuth stack
$smartAuthAppID = $tmpmodule->numero;

// JWT key is per-entity so a token signed for tenant A cannot validate on tenant B.
// admin.lib.php must be loaded BEFORE dolibarr_set_const() is called, otherwise
// JwtKeyHelper (in SmartAuth\Api namespace) falls back to a direct SQL write
// that updates the DB but NOT $conf->global -- breaking JWT minting on the
// very next request. The Blade entry point public/index.php loads admin.lib.php
// itself; for the API entry point pwa/api.php (this file), main.inc.php does
// not auto-load it, hence the explicit require here.
require_once DOL_DOCUMENT_ROOT.'/core/lib/admin.lib.php';
$smartAuthAppKey = trim(getDolGlobalString('DOLIPOCKET_JWT_KEY'));
if (empty($smartAuthAppKey)) {
    $smartAuthAppKey = bin2hex(random_bytes(32));
    if (dolibarr_set_const($db, 'DOLIPOCKET_JWT_KEY', $smartAuthAppKey, 'chaine', 0, '', 0) < 0) {
        dol_syslog("DPK smartmaker-api-prepend: failed to persist DOLIPOCKET_JWT_KEY", LOG_ERR);
    }
}

// PSR-4 autoload for Dolipocket\Api\ is loaded above via require_once
// __DIR__.'/vendor/autoload.php'. composer.json declares the mapping
// Dolipocket\\Api\\ => smartmaker-api/. Run `composer dump-autoload` after
// pulling new controllers into smartmaker-api/ so the optimised classmap is
// regenerated (otherwise newly added controllers will not be found).
//
// Belt and braces: also register an explicit PSR-4 autoloader for our own
// namespace. Some prod deployments ship the source tree without re-running
// `composer dump-autoload`, leaving the vendor/composer/autoload_psr4.php
// stale; SmartAuth then logs "Class (Dolipocket\Api\xxx) not found" and the
// request returns 500. This loader mirrors the SmartAuth-style spl autoload
// (cf ~/dev/smartauth/autoload.php) so newly added controllers / mappers /
// traits are findable even on a stale vendor.
spl_autoload_register(function ($class) {
    $prefix = 'Dolipocket\\Api\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = __DIR__.'/smartmaker-api/'.str_replace('\\', '/', $relative).'.php';
    if (is_file($file)) {
        require $file;
    }
});
