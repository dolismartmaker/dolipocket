<?php

/**
 * Dolibarr autoload initialization helper for unit tests.
 *
 * Defines DOL_DOCUMENT_ROOT pointing at the htdocs/ folder of the
 * cap-rel/dolibarr-integration-sqlite package when available. Skipped if
 * we are running integration tests (they have their own bootstrap).
 */

// Detect integration test mode via the phpunit configuration filename.
$_isIntegrationTest = false;
if (isset($_SERVER['argv'])) {
    foreach ($_SERVER['argv'] as $_arg) {
        if (strpos($_arg, 'phpunit-integration') !== false) {
            $_isIntegrationTest = true;
            break;
        }
    }
}

// Skip initialization if already done or if the integration bootstrap will run.
if (defined('DOL_DOCUMENT_ROOT') || defined('PHPUNIT_RUNNING') || $_isIntegrationTest) {
    unset($_isIntegrationTest);
    return;
}
unset($_isIntegrationTest);

// Resolve the integration package htdocs/ directory if installed.
$_dolibarr_autoload_init_path = __DIR__ . '/../../vendor/cap-rel/dolibarr-integration-sqlite/htdocs';
if (!is_dir($_dolibarr_autoload_init_path)) {
    return; // Package not installed yet.
}

define('DOL_DOCUMENT_ROOT', realpath($_dolibarr_autoload_init_path));

// Provide a minimal global $conf so that classes loaded via composer can be
// instantiated without a fatal at file-time.
global $conf;
$conf = new stdClass();
$conf->file = new stdClass();
$conf->file->main_limit_users = 0;
$conf->global = new stdClass();
$conf->entity = 1;
$conf->currency = 'EUR';

global $langs;
$langs = new stdClass();
$langs->defaultlang = 'fr_FR';

unset($_dolibarr_autoload_init_path);
