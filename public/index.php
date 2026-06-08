<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

ini_set('display_errors', 'Off');

if (!defined('NOCSRFCHECK')) {
	define('NOCSRFCHECK', 1);
}

include 'common_header.php';
include '../config.php';

require_once __DIR__ . '/../vendor/autoload.php';
dol_include_once('/dolipocket/lib/dolipocket.lib.php');

// Dolibarr's admin.lib.php exposes the global function dolibarr_set_const(),
// which is what \SmartAuth\Api\JwtKeyHelper::storeKey() prefers when persisting
// freshly generated JWT keys. main.inc.php does NOT auto-load admin.lib.php in
// normal request flow. Without this require, function_exists('dolibarr_set_const')
// returns false inside JwtKeyHelper, which then falls back to direct SQL.
// The direct SQL writes the const to the DB BUT does NOT update $conf->global,
// so subsequent reads via getDolGlobalString() return empty in the same request.
// That breaks JWT minting in the worst possible way: SmartAuth signs the token
// with the just-generated key (which it returns from getKey()), but the in-memory
// $conf->global stays empty -- and on the very next request (pwa/api.php), a
// fresh call to JwtKeyHelper::getKey() reads an empty $conf->global, generates
// ANOTHER key, persists it (overwriting the previous one), and returns the new
// key for validation. The signature mismatch returns 401 on every API call and
// the PWA bounces straight back to /login.
//
// Loading admin.lib.php here ensures JwtKeyHelper takes the dolibarr_set_const
// branch, which DOES update $conf->global on success.
require_once DOL_DOCUMENT_ROOT . '/core/lib/admin.lib.php';

// SmartAuth must be in scope before AuthController::loginSubmit instantiates
// \SmartAuth\Api\AuthController and calls generateTokenForAuthenticatedUser:
//   1) load smartauth's autoloader (Dolibarr's main.inc.php does not pull it
//      automatically - the API entry-point pwa/api.php loads it via
//      smartmaker-api-prepend.php, but the Blade flow has no equivalent prelude).
//   2) pin the module name so JwtKeyHelper::getKey() can resolve the per-entity
//      JWT key (SmartAuth\Api\RouteCache::init() stashes the module key in a
//      static field).
dol_include_once('/smartauth/autoload.php');
if (class_exists('SmartAuth\\Api\\RouteCache')) {
	\SmartAuth\Api\RouteCache::init('dolipocket');
}

// Pre-seed DOLIPOCKET_JWT_KEY ($conf->global) BEFORE any login flow can mint
// a JWT. JwtKeyHelper::getKey() is lazy: it auto-generates + persists on first
// call. On a clean install (or a brand new test fixture) the FIRST Blade login
// triggers that lazy path, and even with admin.lib.php loaded above, the timing
// is still fragile (race with subsequent pwa/api.php prepend that would also
// try to auto-generate if its read of $conf->global returns empty). Doing this
// here makes the key generation idempotent and front-loaded.
if (class_exists('SmartAuth\\Api\\JwtKeyHelper')) {
	\SmartAuth\Api\JwtKeyHelper::getKey('dolipocket');
}

$newlang = (string) GETPOST('lang', 'alpha');
if (!empty($newlang)) {
	dol_syslog("DPK: set lang to $newlang");
	$_SESSION['lang'] = $newlang;
}
$lang = $_SESSION['lang'] ?? getDolGlobalString('MAIN_LANG_DEFAULT', 'fr_FR');
$langs->setDefaultLang($lang);

use Dolipocket\Web\RouteController as Route;
use Dolipocket\Web\HomeController;
use Dolipocket\Web\AuthController;

// Public landing.
Route::get('/',          [HomeController::class, 'index']);
Route::get('index.php',  [HomeController::class, 'index']);
Route::get('pricing',    [HomeController::class, 'pricing']);
Route::get('legal',      [HomeController::class, 'legal']);
Route::get('terms',      [HomeController::class, 'terms']);

// Signup with OTP confirmation.
Route::get('signup',          [AuthController::class, 'signup']);
Route::post('signup',         [AuthController::class, 'signupSubmit']);
Route::get('signup/verify',   [AuthController::class, 'verify']);
Route::post('signup/verify',  [AuthController::class, 'verifySubmit']);
Route::get('signup/done',     [AuthController::class, 'done']);

// Login + password recovery.
Route::get('login',          [AuthController::class, 'login']);
Route::post('login',         [AuthController::class, 'loginSubmit']);
Route::get('logout',         [AuthController::class, 'logout']);
Route::get('forgot',         [AuthController::class, 'forgot']);
Route::post('forgot',        [AuthController::class, 'forgotSubmit']);
Route::get('reset/{token}',  [AuthController::class, 'reset']);
Route::post('reset/{token}', [AuthController::class, 'resetSubmit']);

// Garbage routes -> homepage.
Route::get('',      [HomeController::class, 'index']);
Route::post('',     [HomeController::class, 'index']);

dol_syslog('DPK Route error: no route matched ' . ($_SERVER['REQUEST_URI'] ?? ''), LOG_WARNING);
http_response_code(404);
print 'Route error';
exit;
