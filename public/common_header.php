<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

// Disable Dolibarr login enforcement since we run our own auth flow.
if (!defined('NOLOGIN')) {
	define('NOLOGIN', 1);
}
if (!defined('NOBROWSERNOTIF')) {
	define('NOBROWSERNOTIF', '1');
}
if (!defined('NOIPCHECK')) {
	define('NOIPCHECK', '1');
}

// Resolve target Dolibarr entity BEFORE Dolibarr bootstrap. The harness reads
// $_SESSION['dol_entity'] / DOLENTITY constant to scope $conf->entity.
// Resolution priority: explicit X-DOL-ENTITY header, then session set by login,
// then sub-domain mapping (resolved at login time, not here).
if (session_status() !== PHP_SESSION_ACTIVE) {
	session_start();
}

if (isset($_SERVER['HTTP_DOLENTITY'])) {
	$x_header_entity = (int) $_SERVER['HTTP_DOLENTITY'];
	if (!empty($x_header_entity)) {
		$_SESSION['entity'] = $x_header_entity;
		$_SESSION['dol_entity'] = $x_header_entity;
		if (!defined('DOLENTITY')) {
			define('DOLENTITY', $x_header_entity);
		}
	}
}

if (!empty($_SESSION['entity']) && !defined('DOLENTITY')) {
	define('DOLENTITY', (int) $_SESSION['entity']);
	$_SESSION['dol_entity'] = (int) $_SESSION['entity'];
}

$sessionLang = $_GET['lang'] ?? $_SESSION['lang'] ?? '';
if ($sessionLang !== '') {
	if (!defined('MAIN_LANG_DEFAULT')) {
		define('MAIN_LANG_DEFAULT', $sessionLang);
	}
}

// Release session before Dolibarr re-opens it.
session_abort();
