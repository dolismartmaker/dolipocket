<?php

// PHPStan bootstrap for Dolipocket.
// Defines a minimal set of Dolibarr constants so that static analysis can run
// against module sources without requiring the actual Dolibarr environment.

if (!defined('DOL_DOCUMENT_ROOT')) {
    define('DOL_DOCUMENT_ROOT', '/dolibarr');
}
if (!defined('DOL_DATA_ROOT')) {
    define('DOL_DATA_ROOT', '/dolibarr-data');
}
if (!defined('DOL_URL_ROOT')) {
    define('DOL_URL_ROOT', '/');
}
if (!defined('DOL_MAIN_URL_ROOT')) {
    define('DOL_MAIN_URL_ROOT', '/');
}
if (!defined('NOLOGIN')) {
    define('NOLOGIN', '1');
}
if (!defined('MAIN_DB_PREFIX')) {
    define('MAIN_DB_PREFIX', 'llx_');
}
if (!defined('DOL_VERSION')) {
    define('DOL_VERSION', '20.0.0');
}
