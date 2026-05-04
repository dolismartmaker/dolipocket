<?php

namespace Dolipocket\Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Smoke test: verifies that the test harness boots and that composer-managed
 * Dolipocket namespaces are wired up correctly.
 */
class SmokeTest extends TestCase
{
    public function testComposerAutoloadIsAvailable(): void
    {
        $this->assertTrue(
            class_exists(\Composer\Autoload\ClassLoader::class),
            'Composer autoloader should be loaded by the bootstrap.'
        );
    }

    public function testDolipocketWebNamespaceIsRegistered(): void
    {
        // Provided by composer.json autoload psr-4 mapping.
        $this->assertTrue(
            class_exists(\Dolipocket\Web\BaseController::class)
            || interface_exists(\Dolipocket\Web\BaseController::class),
            'Dolipocket\\Web\\BaseController should resolve via the composer autoloader.'
        );
    }

    public function testProjectStructureIsPresent(): void
    {
        $projectRoot = dirname(__DIR__, 3);
        $this->assertFileExists(
            $projectRoot . '/core/modules/modDolipocket.class.php',
            'Module descriptor should be present at the expected path.'
        );
        $this->assertFileExists(
            $projectRoot . '/lib/dolipocket.lib.php',
            'Module helpers should be present at the expected path.'
        );
    }
}
