<?php
/**
 * test/mobile/backend/blade-shim.php
 *
 * Wrapper around the production public/index.php for the Playwright suite.
 *
 * Historical role: this shim used to inject two test-only setup steps
 * (smartauth/autoload + RouteCache::init) that were missing in production.
 * Both are now part of public/index.php itself, so the shim is effectively
 * a passthrough -- it stays here only to keep the router stable in case we
 * ever need to interleave new test-only side effects again.
 *
 * IMPORTANT: this file lives in the TEST tree and never ships in the module
 * Dolistore zip.
 */

include __DIR__ . '/../../../public/index.php';
