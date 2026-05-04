<?php

/**
 * Bootstrap for PHPUnit unit tests.
 *
 * Loads composer autoloader and Dolibarr autoload helper for resolving
 * DOL_DOCUMENT_ROOT to the integration package's htdocs/ when present.
 */

// Define MAIN_DB_PREFIX for tests (used in SQL queries by helpers)
if (!defined('MAIN_DB_PREFIX')) {
    define('MAIN_DB_PREFIX', 'llx_');
}

// Load composer autoloader
require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

// Load helper that defines DOL_DOCUMENT_ROOT and a minimal $conf if the
// dolibarr-integration-sqlite package is installed (skipped for integration
// tests which have their own bootstrap).
require_once __DIR__ . '/dolibarr-autoload-init.php';

// Extend the global $conf with cache used by some Dolibarr helpers.
global $conf;
if (!isset($conf) || !is_object($conf)) {
    $conf = new stdClass();
}
if (!isset($conf->cache)) {
    $conf->cache = [];
}
if (!isset($conf->global) || !is_object($conf->global)) {
    $conf->global = new stdClass();
}
if (!isset($conf->entity)) {
    $conf->entity = 1;
}
