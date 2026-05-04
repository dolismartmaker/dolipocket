<?php

namespace Dolipocket\Tests\Http;

use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Base class for Dolipocket HTTP functional tests.
 *
 * Spawns a PHP built-in server with the admin router on a port read from the
 * DOLIPOCKET_TEST_BACKEND_PORT environment variable (fallback 8790, allocated
 * for Dolipocket in ~/docs/TESTING_PWA.md). All tests in a class share a
 * single server instance, started in setUpBeforeClass and torn down in
 * tearDownAfterClass (which also restores the real main.inc.php in case the
 * router installed a shim).
 */
abstract class HttpTestCase extends TestCase
{
    /** @var int Server port (resolved from env in setUpBeforeClass) */
    protected static $serverPort = 0;

    /** @var int|null Server process PID */
    protected static $serverPid = null;

    /** @var string Server base URL */
    protected static $baseUrl = '';

    /** @var HttpClientInterface|null HTTP client */
    protected $client;

    /**
     * Default router path. Subclasses may override.
     */
    protected static function getRouterPath(): string
    {
        return dirname(__DIR__, 3) . '/test/http/admin-router.php';
    }

    public static function setUpBeforeClass(): void
    {
        parent::setUpBeforeClass();

        $projectRoot = dirname(__DIR__, 3);
        $routerPath = static::getRouterPath();
        $documentRoot = $projectRoot;

        // Read port from env (allocated by .claude/settings.json), fallback to
        // the value reserved for Dolipocket in TESTING_PWA.md.
        $envPort = getenv('DOLIPOCKET_TEST_BACKEND_PORT');
        $startPort = (int) ($envPort !== false && $envPort !== '' ? $envPort : 8790);
        self::$serverPort = self::findAvailablePort($startPort);
        self::$baseUrl = 'http://127.0.0.1:' . self::$serverPort;

        $logFile = sys_get_temp_dir() . '/dolipocket_http_test_' . self::$serverPort . '.log';
        $command = sprintf(
            'php -S 127.0.0.1:%d -t %s %s > %s 2>&1 & echo $!',
            self::$serverPort,
            escapeshellarg($documentRoot),
            escapeshellarg($routerPath),
            escapeshellarg($logFile)
        );

        $output = [];
        exec($command, $output);
        self::$serverPid = (int) ($output[0] ?? 0);

        if (self::$serverPid <= 0) {
            throw new \RuntimeException('Failed to start PHP built-in server.');
        }

        // Wait for the server to be ready (up to 5 s)
        $maxAttempts = 50;
        $attempt = 0;
        while ($attempt < $maxAttempts) {
            $socket = @fsockopen('127.0.0.1', self::$serverPort, $errno, $errstr, 0.1);
            if ($socket) {
                fclose($socket);
                break;
            }
            usleep(100000);
            $attempt++;
        }

        if ($attempt >= $maxAttempts) {
            self::stopServer();
            throw new \RuntimeException(
                'PHP server did not start in time. See ' . $logFile
            );
        }
    }

    public static function tearDownAfterClass(): void
    {
        self::stopServer();

        // Restore real main.inc.php if the router installed a shim.
        $projectRoot = dirname(__DIR__, 3);
        $dolibarrPath = realpath($projectRoot . '/vendor/cap-rel/dolibarr-integration-sqlite/htdocs');
        if ($dolibarrPath) {
            $realMainBackup = $dolibarrPath . '/main.inc.php.real';
            $mainPath = $dolibarrPath . '/main.inc.php';
            if (file_exists($realMainBackup)) {
                copy($realMainBackup, $mainPath);
                unlink($realMainBackup);
            }
        }

        parent::tearDownAfterClass();
    }

    protected static function stopServer(): void
    {
        if (self::$serverPid !== null && self::$serverPid > 0) {
            exec('kill ' . self::$serverPid . ' 2>/dev/null');
            exec('pkill -P ' . self::$serverPid . ' 2>/dev/null');
            self::$serverPid = null;
        }
    }

    protected static function findAvailablePort(int $startPort): int
    {
        $port = $startPort;
        $maxPort = $startPort + 100;

        while ($port < $maxPort) {
            $socket = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
            if (!$socket) {
                return $port;
            }
            fclose($socket);
            $port++;
        }

        throw new \RuntimeException('Could not find available port in range ' . $startPort . '-' . $maxPort);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->client = HttpClient::create([
            'timeout' => 10,
            'max_redirects' => 0,
        ]);
    }

    /**
     * @param array<string, string> $headers
     * @return array{statusCode: int, headers: array, body: string, json: ?array}
     */
    protected function get(string $path, array $headers = []): array
    {
        return $this->request('GET', $path, [], $headers);
    }

    /**
     * @param array<string, mixed>  $body
     * @param array<string, string> $headers
     * @return array{statusCode: int, headers: array, body: string, json: ?array}
     */
    protected function post(string $path, array $body = [], array $headers = []): array
    {
        return $this->request('POST', $path, $body, $headers);
    }

    /**
     * @param array<string, mixed>  $body
     * @param array<string, string> $headers
     * @return array{statusCode: int, headers: array, body: string, json: ?array}
     */
    protected function request(string $method, string $path, array $body = [], array $headers = []): array
    {
        $url = self::$baseUrl . $path;

        $options = ['headers' => $headers];
        if (!empty($body) && $method !== 'GET') {
            $options['body'] = $body;
        }

        $response = $this->client->request($method, $url, $options);

        $statusCode = $response->getStatusCode();
        $responseHeaders = $response->getHeaders(false);
        $responseBody = $response->getContent(false);

        $json = null;
        $contentType = $responseHeaders['content-type'][0] ?? '';
        if (strpos($contentType, 'json') !== false) {
            $json = json_decode($responseBody, true);
        }

        return [
            'statusCode' => $statusCode,
            'headers' => $responseHeaders,
            'body' => $responseBody,
            'json' => $json,
        ];
    }

    /**
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertStatusCode(int $expected, array $response): void
    {
        $this->assertEquals(
            $expected,
            $response['statusCode'],
            "Expected status code $expected, got {$response['statusCode']}. Body: " . substr($response['body'], 0, 500)
        );
    }

    /**
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertHeaderContains(string $name, string $needle, array $response): void
    {
        $name = strtolower($name);
        $this->assertArrayHasKey($name, $response['headers'], "Header '$name' not found");
        $this->assertStringContainsString($needle, $response['headers'][$name][0]);
    }

    /**
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertJsonResponse(array $response): void
    {
        $this->assertHeaderContains('content-type', 'json', $response);
        $this->assertNotNull($response['json'], 'Response is not valid JSON');
    }

    /**
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertJsonHasKey(string $key, array $response): void
    {
        $this->assertJsonResponse($response);
        $this->assertArrayHasKey($key, $response['json']);
    }

    /**
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertJsonEquals(string $key, $expected, array $response): void
    {
        $this->assertJsonHasKey($key, $response);
        $this->assertEquals($expected, $response['json'][$key]);
    }

    /**
     * Assert that the response contains no PHP fatal-error markers.
     * If an undefined symbol is detected, scan the entire module to surface
     * every other occurrence.
     *
     * @param array{statusCode: int, headers: array, body: string, json: ?array} $response
     */
    protected function assertNoPhpError(array $response, string $pageLabel): void
    {
        $body = $response['body'];
        $excerpt = substr($body, 0, 2000);

        $this->assertNotEquals(
            500,
            $response['statusCode'],
            "$pageLabel returned 500. Body: $excerpt"
        );

        $patterns = [
            'Fatal error:',
            'Uncaught Error:',
            'Call to undefined method',
            'Call to undefined function',
            'Class .* not found',
            'Parse error:',
            'syntax error, unexpected',
            'PHPUNIT_FATAL_ERROR:',
            'Include of main fails',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match('/' . $pattern . '/i', $body)) {
                $message = "$pageLabel contains PHP error matching '$pattern'. Body: $excerpt";

                $extra = $this->scanModuleForSymbol($body);
                if ($extra !== '') {
                    $message .= "\n\n" . $extra;
                }

                $this->fail($message);
            }
        }
    }

    /**
     * Extract the undefined symbol from an error body and search all module
     * PHP files for other occurrences. Helps to surface typos that only one
     * code path triggers.
     */
    private function scanModuleForSymbol(string $body): string
    {
        $symbol = '';
        $symbolType = '';

        if (preg_match('/Call to undefined method \S+::(\w+)\(\)/i', $body, $m)) {
            $symbol = $m[1];
            $symbolType = 'method';
        } elseif (preg_match('/Call to undefined function (\w+)\(\)/i', $body, $m)) {
            $symbol = $m[1];
            $symbolType = 'function';
        } elseif (preg_match('/Class ["\']?(\w+)["\']? not found/i', $body, $m)) {
            $symbol = $m[1];
            $symbolType = 'class';
        }

        if ($symbol === '') {
            return '';
        }

        $projectRoot = dirname(__DIR__, 3);
        $hits = [];

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($projectRoot, \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            $path = $file->getPathname();

            if ($file->getExtension() !== 'php') {
                continue;
            }
            if (preg_match('#/(vendor|test|tmp|build|node_modules|docs|mobile)/#', $path)) {
                continue;
            }

            $content = file_get_contents($path);
            $lines = explode("\n", $content);
            foreach ($lines as $lineNum => $line) {
                if (stripos($line, $symbol) !== false) {
                    $relativePath = str_replace($projectRoot . '/', '', $path);
                    $hits[] = $relativePath . ':' . ($lineNum + 1) . ': ' . trim($line);
                }
            }
        }

        if (empty($hits)) {
            return '';
        }

        return sprintf(
            "--- Full module scan: %s \"%s\" found in %d location(s) ---\n%s",
            $symbolType,
            $symbol,
            count($hits),
            implode("\n", $hits)
        );
    }
}
