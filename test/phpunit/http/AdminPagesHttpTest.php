<?php

namespace Dolipocket\Tests\Http;

/**
 * Dynamic GET + POST scan of all PHP pages in admin/, ajax/ and the module
 * root. Detects PHP fatals via the shutdown handler installed by the router
 * and via assertNoPhpError() body pattern matching.
 */
class AdminPagesHttpTest extends HttpTestCase
{
    protected static function getRouterPath(): string
    {
        return dirname(__DIR__, 3) . '/test/http/admin-router.php';
    }

    public function testAdminRouterPing(): void
    {
        $response = $this->get('/ping');
        $this->assertStatusCode(200, $response);
        $this->assertJsonEquals('status', 'ok', $response);
    }

    /**
     * Sanity check: at least one admin page must render real Dolibarr HTML.
     * If this fails (e.g. body is "Include of main fails"), every other test
     * becomes a false positive.
     */
    public function testSanityAdminPageRendersRealContent(): void
    {
        $response = $this->get('/admin/setup.php');
        $this->assertStatusCode(200, $response);
        $this->assertStringNotContainsString(
            'Include of main fails',
            $response['body'],
            'Router did not load main.inc.php -- every other test is a false positive.'
        );
        $this->assertGreaterThan(
            1000,
            strlen($response['body']),
            'admin/setup.php returned suspiciously little HTML -- router probably broken.'
        );
    }

    /**
     * @dataProvider adminPagesProvider
     */
    public function testAdminPageLoadsWithoutError(string $page): void
    {
        $response = $this->get('/admin/' . $page);
        $this->assertNoPhpError($response, 'admin/' . $page);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function adminPagesProvider(): array
    {
        $adminDir = dirname(__DIR__, 3) . '/admin';
        if (!is_dir($adminDir)) {
            return [];
        }
        $files = glob($adminDir . '/*.php') ?: [];
        $cases = [];
        foreach ($files as $file) {
            $basename = basename($file);
            $cases[$basename] = [$basename];
        }
        ksort($cases);
        return $cases;
    }

    /**
     * @dataProvider rootPagesProvider
     */
    public function testRootPageLoadsWithoutError(string $page): void
    {
        if ($page === '__skip__') {
            $this->markTestSkipped('No root pages to test');
            return;
        }
        $response = $this->get('/' . $page);
        $this->assertNoPhpError($response, $page);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function rootPagesProvider(): array
    {
        $projectRoot = dirname(__DIR__, 3);
        // config.php is the SaaS configuration file (not a Dolibarr page).
        // smartmaker-api-prepend.php is loaded by the SmartAuth API runtime,
        // not via HTTP. index.php is the public Blade front controller.
        $excluded = ['config.php', 'smartmaker-api-prepend.php'];
        $files = glob($projectRoot . '/*.php') ?: [];
        $cases = [];
        foreach ($files as $file) {
            $basename = basename($file);
            if (in_array($basename, $excluded, true)) {
                continue;
            }
            $cases[$basename] = [$basename];
        }
        if (empty($cases)) {
            return ['__skip__' => ['__skip__']];
        }
        ksort($cases);
        return $cases;
    }

    /**
     * @dataProvider ajaxPagesProvider
     */
    public function testAjaxPageLoadsWithoutError(string $page): void
    {
        if ($page === '__skip__') {
            $this->markTestSkipped('No ajax/ pages to test');
            return;
        }
        $response = $this->get('/ajax/' . $page);
        $this->assertNoPhpError($response, 'ajax/' . $page);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function ajaxPagesProvider(): array
    {
        $ajaxDir = dirname(__DIR__, 3) . '/ajax';
        if (!is_dir($ajaxDir)) {
            return ['__skip__' => ['__skip__']];
        }
        $files = glob($ajaxDir . '/*.php') ?: [];
        if (empty($files)) {
            return ['__skip__' => ['__skip__']];
        }
        $cases = [];
        foreach ($files as $file) {
            $basename = basename($file);
            $cases[$basename] = [$basename];
        }
        ksort($cases);
        return $cases;
    }

    /**
     * @dataProvider allPostActionsProvider
     */
    public function testPostActionWithoutError(string $page, string $action, string $urlPrefix): void
    {
        if ($page === '__skip__') {
            $this->markTestSkipped('No POST actions to test');
            return;
        }

        $response = $this->post($urlPrefix . $page, [
            'action' => $action,
            'token' => 'test',
            'confirm' => 'yes',
        ]);

        $this->assertNoPhpError($response, "$urlPrefix$page (POST action=$action)");
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public static function allPostActionsProvider(): array
    {
        $projectRoot = dirname(__DIR__, 3);
        $cases = [];
        $cases += self::extractPostActions($projectRoot . '/admin', '/admin/');
        $cases += self::extractPostActions($projectRoot, '/');
        $cases += self::extractPostActions($projectRoot . '/ajax', '/ajax/');
        if (empty($cases)) {
            return ['__skip__' => ['__skip__', '', '']];
        }
        ksort($cases);
        return $cases;
    }

    /**
     * Scan a directory's *.php files for $action == 'xxx' / $action === 'xxx'
     * patterns and return one test case per detected action.
     *
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    private static function extractPostActions(string $dir, string $urlPrefix): array
    {
        if (!is_dir($dir)) {
            return [];
        }
        $files = glob($dir . '/*.php') ?: [];
        $cases = [];
        $skipActions = ['create', 'edit', 'delete', 'view', 'specimen'];
        $skipFiles = ['config.php', 'smartmaker-api-prepend.php'];
        foreach ($files as $file) {
            $basename = basename($file);
            if (in_array($basename, $skipFiles, true)) {
                continue;
            }
            $content = file_get_contents($file);
            if ($content === false) {
                continue;
            }
            // Note the ===? to also catch strict comparisons ($action === 'add').
            if (preg_match_all('/\$action\s*===?\s*[\'"]([a-z_]+)[\'"]/i', $content, $matches)) {
                $actions = array_unique($matches[1]);
                foreach ($actions as $act) {
                    if (in_array($act, $skipActions, true)) {
                        continue;
                    }
                    $label = $urlPrefix . "$basename action=$act";
                    $cases[$label] = [$basename, $act, $urlPrefix];
                }
            }
        }
        return $cases;
    }
}
