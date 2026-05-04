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
