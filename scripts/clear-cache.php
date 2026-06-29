<?php
/**
 * scripts/clear-cache.php
 *
 * Hard reset of every server-side cache that can mask a Dolipocket code
 * change in dev:
 *   1. PHP opcache (the big one: php-fpm keeps every .php in RAM with a
 *      revalidate frequency of seconds-to-minutes, so changes to mappers
 *      / controllers / smartauth often look like nothing happened until
 *      the worker pool is recycled).
 *   2. SmartAuth RouteCache file (cached route table per module).
 *   3. Dolibarr template cache (twig/blade compiled templates).
 *
 * Usage:
 *   php /<dolibarr-root>/custom/dolipocket/scripts/clear-cache.php
 *
 * Safe to run in production -- only flushes server-side caches, never
 * touches data.
 */

$flushed = [];

// 1. PHP opcache.
if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        $flushed[] = 'opcache_reset';
    } else {
        $flushed[] = 'opcache_reset (no-op)';
    }
} else {
    $flushed[] = 'opcache_reset (extension not loaded)';
}

// 2. SmartAuth RouteCache. Path varies per Dolibarr install: search common
// candidates relative to this script.
$projectRoot = dirname(__DIR__);
$candidates = array_unique(array_filter([
    realpath($projectRoot . '/../../documents/smartauth') ?: null,
    realpath($projectRoot . '/../../../documents/smartauth') ?: null,
    realpath($projectRoot . '/../../../../documents/smartauth') ?: null,
    realpath($projectRoot . '/vendor/cap-rel/dolibarr-integration-sqlite/documents/smartauth') ?: null,
]));
foreach ($candidates as $dir) {
    if (!$dir || !is_dir($dir)) continue;
    foreach (glob($dir . '/*-routes-cache.php') as $f) {
        if (@unlink($f)) {
            $flushed[] = 'route-cache: ' . basename($f);
        }
    }
    foreach (glob($dir . '/*-routes-cache.json') as $f) {
        if (@unlink($f)) {
            $flushed[] = 'route-cache: ' . basename($f);
        }
    }
}

// 3. Dolibarr blade compiled templates (used by the public site).
foreach ($candidates as $dir) {
    if (!$dir) continue;
    $bladeCache = dirname($dir) . '/dolipocket/blade-cache';
    if (is_dir($bladeCache)) {
        foreach (glob($bladeCache . '/*') as $f) {
            if (@unlink($f)) $flushed[] = 'blade-cache: ' . basename($f);
        }
    }
}

// Also bust the realpath cache so file_exists / include hits the disk again.
clearstatcache(true);
$flushed[] = 'clearstatcache';

echo "Dolipocket cache flush:\n";
foreach ($flushed as $line) {
    echo "  - " . $line . "\n";
}
echo "\nNote: if php-fpm is running with opcache.validate_timestamps=0, you\n";
echo "still need to systemctl reload php-fpm for changes to take effect.\n";
