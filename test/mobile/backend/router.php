<?php
/**
 * test/mobile/backend/router.php
 *
 * Router script passed to `php -S 127.0.0.1:port -t htdocs/ router.php`.
 *
 * Two URL families flow through this router:
 *
 *  1. /custom/dolipocket/pwa/api.php/<route>
 *     Smartmaker API used by the PWA. Splits SCRIPT_FILENAME (the .php file)
 *     from PATH_INFO (the trailing route) so php -S finds the script.
 *
 *  2. /custom/dolipocket/public/<path>
 *     Public Blade site. The Dolipocket router (Dolipocket\Web\RouteController)
 *     parses the segment AFTER `index.php/` from REQUEST_URI; we therefore
 *     synthesize REQUEST_URI = "/index.php/<path>" before forwarding.
 *
 *  Static assets (.js, .css, images) under any path are served by php -S
 *  natively (we return false). All other paths return 404 so misuses are
 *  obvious in the test logs.
 *
 * Pre-populating $_SERVER['CONTEXT_DOCUMENT_ROOT'] is required because
 * smartmaker-api-prepend.php walks up from realpath(__FILE__) -- the symlink
 * target -- to find main.inc.php, which lands outside the test htdocs/.
 */

$docroot = $_SERVER['DOCUMENT_ROOT']; // injected by php -S via -t

// Force prod mode so fatals surface as 500 rather than blank pages.
if (empty($_SERVER['DOLIBARR_MAIN_PROD'])) {
    $_SERVER['DOLIBARR_MAIN_PROD'] = '1';
}

// Inject CONTEXT_DOCUMENT_ROOT so smartmaker-api-prepend.php's first include
// branch wins (it tries $_SERVER["CONTEXT_DOCUMENT_ROOT"]."/main.inc.php").
$_SERVER['CONTEXT_DOCUMENT_ROOT'] = $docroot;

// CORS for the test PWA origin: pwa/api.php only whitelists 5173, but our
// vite preview runs on a different port (5195 by default). We emit CORS
// headers here so the browser accepts the cross-origin XHR. Headers set
// before any include() are honoured even if the included file does not add
// its own CORS (since the api.php whitelist will not match the test origin
// it just falls through). Browsers reject "Access-Control-Allow-Origin: *"
// when the request carries credentials, so we echo back the actual origin.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$pwaPort = (int) (getenv('DOLIPOCKET_TEST_PWA_PORT') ?: 5195);
$testAllowedOrigins = [
    'http://127.0.0.1:' . $pwaPort,
    'http://localhost:' . $pwaPort,
];
if ($origin !== '' && in_array($origin, $testAllowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Device-Uuid, X-DEVICEID, DOLENTITY');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    return true;
}

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Static asset bypass: let php -S serve files with a known extension natively.
if (preg_match('/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|map|webp|webmanifest)$/i', $uri)) {
    return false;
}

// ---------------------------------------------------------------
// Family 1 -- /custom/dolipocket/public/<path>  (Blade site)
//
// MUST be checked BEFORE Family 2 because the production public/index.php
// file matches the .php pattern Family 2 uses, and we want our test shim
// to win for every Blade entry point (including direct hits on
// /custom/dolipocket/public/index.php).
//
// The Dolipocket public router parses the URL slug AFTER `index.php/`. We
// rewrite REQUEST_URI from "/custom/dolipocket/public/login" to
// "/index.php/login" so the router's regex (.*index\.php\/) catches it.
//
// We delegate to test/mobile/backend/blade-shim.php instead of the
// production public/index.php: the shim adds two test-only setup steps
// that the production Blade entry-point lacks (smartauth autoload +
// RouteCache::init('dolipocket') so JWT minting works). See blade-shim.php
// for the full reasoning.
// ---------------------------------------------------------------
// Routes served by the Blade public site (defined in public/index.php). In
// production Dolipocket is mounted at the root of a dedicated subdomain so
// every Blade form uses absolute paths like action="/login". The test php -S
// must therefore accept those root URIs AND the /custom/dolipocket/public/<...>
// variant (used directly by the Playwright fixture for the initial GET).
$bladeRoutes = [
    '/', '/login', '/logout', '/pricing', '/legal', '/terms',
    '/signup', '/signup/verify', '/signup/done', '/forgot',
];
$bladeRoutePatterns = [
    '#^/reset/[A-Za-z0-9_-]+$#',
];
$isBladeRoot = in_array($uri, $bladeRoutes, true);
if (!$isBladeRoot) {
    foreach ($bladeRoutePatterns as $pattern) {
        if (preg_match($pattern, $uri)) {
            $isBladeRoot = true;
            break;
        }
    }
}
$isBladePrefixed = (bool) preg_match('#^/custom/dolipocket/public(?:/(.*))?$#', $uri, $m);

if ($isBladeRoot || $isBladePrefixed) {
    $slug = $isBladePrefixed ? ($m[1] ?? '') : ltrim($uri, '/');
    $bladeShim = __DIR__ . '/blade-shim.php';
    if (!is_file($bladeShim)) {
        http_response_code(500);
        echo 'blade-shim.php missing at ' . $bladeShim;
        return true;
    }
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    $_SERVER['SCRIPT_FILENAME'] = $bladeShim;
    $rewritten = '/index.php' . ($slug !== '' ? '/' . $slug : '/');
    if (!empty($_SERVER['QUERY_STRING'])) {
        $rewritten .= '?' . $_SERVER['QUERY_STRING'];
    }
    $_SERVER['REQUEST_URI'] = $rewritten;
    $_SERVER['PHP_SELF'] = $rewritten;
    chdir(dirname($docroot . '/custom/dolipocket/public/index.php'));
    require $bladeShim;
    return true;
}

// ---------------------------------------------------------------
// Family 2 -- /<...>.php(/<route>)  (covers pwa/api.php and any other PHP)
// ---------------------------------------------------------------
if (preg_match('#^(.+\.php)(/.*)?$#', $uri, $m)) {
    $scriptPath = $m[1];
    $pathInfo = $m[2] ?? '';
    $absScript = $docroot . $scriptPath;
    if (is_file($absScript)) {
        $_SERVER['SCRIPT_NAME'] = $scriptPath;
        $_SERVER['SCRIPT_FILENAME'] = $absScript;
        $_SERVER['PHP_SELF'] = $scriptPath . $pathInfo;
        $_SERVER['PATH_INFO'] = $pathInfo;
        // chdir to the script's directory so relative requires inside it
        // (e.g. pwa/api.php's `require_once '../smartmaker-api-prepend.php'`)
        // resolve against the right base, not the router's location.
        chdir(dirname($absScript));
        require $absScript;
        return true;
    }
}

// Default 404
http_response_code(404);
echo 'Not Found: ' . $uri;
return true;
