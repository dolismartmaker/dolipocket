<?php

/**
 * Static asset proxy for federated plugin remotes.
 *
 * The PWA is served from this `pwa/` directory (often a dedicated vhost whose
 * docroot IS pwa/). The browser therefore cannot reach a sibling Dolibarr
 * module's files at /custom/<plugin>/... . This script -- a sibling of api.php
 * -- streams a plugin's Module Federation bundle straight from disk so the host
 * can load it same-origin (no CORS).
 *
 * URL uses PATH_INFO, exactly like api.php/home:
 *   plugin.php/<pluginId>/<relative-path-in-dist>
 *     plugin.php/capmail/remoteEntry.js
 *     plugin.php/capmail/assets/xyz.js   <- relative chunk imports keep working
 *
 * Serves ONLY files under <module>/integrations/dolipocket/frontend/dist/, with
 * a safe-extension whitelist and a realpath containment check. No Dolibarr
 * bootstrap (fast, runs per chunk): "is the plugin active?" gating is done by
 * GET /home, which only advertises the remote when the module is enabled, so
 * the browser never requests this for a disabled module. The bundle is
 * non-sensitive JS anyway.
 */

$pathInfo = isset($_SERVER['PATH_INFO']) ? ltrim($_SERVER['PATH_INFO'], '/') : '';
$slash = strpos($pathInfo, '/');
if ($pathInfo === '' || $slash === false) {
    http_response_code(404);
    exit;
}

$pluginId = substr($pathInfo, 0, $slash);
$relPath  = substr($pathInfo, $slash + 1);

// Plugin id must be a safe slug (no path separators, no traversal).
if ($relPath === '' || !preg_match('/^[a-zA-Z0-9_-]+$/', $pluginId)) {
    http_response_code(404);
    exit;
}

// Convention: <custom>/<pluginId>/integrations/dolipocket/frontend/dist.
// This file lives in <custom>/dolipocket/pwa, so the modules dir is two levels up.
$distBase = realpath(__DIR__.'/../../'.$pluginId.'/integrations/dolipocket/frontend/dist');
if ($distBase === false || !is_dir($distBase)) {
    http_response_code(404);
    exit;
}

$target = realpath($distBase.'/'.$relPath);
// Containment: the resolved file MUST live inside the dist dir (blocks ../).
if ($target === false
    || strncmp($target, $distBase.DIRECTORY_SEPARATOR, strlen($distBase) + 1) !== 0
    || !is_file($target)) {
    http_response_code(404);
    exit;
}

// A federated bundle is only these. Anything else (e.g. a stray .php) -> 404.
$types = array(
    'js'    => 'text/javascript; charset=utf-8',
    'mjs'   => 'text/javascript; charset=utf-8',
    'css'   => 'text/css; charset=utf-8',
    'json'  => 'application/json; charset=utf-8',
    'map'   => 'application/json; charset=utf-8',
    'wasm'  => 'application/wasm',
    'svg'   => 'image/svg+xml',
    'png'   => 'image/png',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'gif'   => 'image/gif',
    'webp'  => 'image/webp',
    'woff'  => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf'   => 'font/ttf',
);
$ext = strtolower(pathinfo($target, PATHINFO_EXTENSION));
if (!isset($types[$ext])) {
    http_response_code(404);
    exit;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    exit;
}

header('Content-Type: '.$types[$ext]);
header('Content-Length: '.filesize($target));
// Hashed chunk filenames are immutable -> cache hard. remoteEntry.js must be
// revalidated so a redeploy of the plugin is picked up.
$basename = basename($target);
if ($basename === 'remoteEntry.js' || $basename === 'mf-manifest.json') {
    header('Cache-Control: no-cache, must-revalidate');
} else {
    header('Cache-Control: public, max-age=31536000, immutable');
}
if ($method === 'HEAD') {
    exit;
}
readfile($target);
