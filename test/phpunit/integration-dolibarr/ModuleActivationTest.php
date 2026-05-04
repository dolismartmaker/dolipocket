<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

/**
 * Integration test verifying that the Dolipocket module descriptor can be
 * loaded against a real Dolibarr SQLite environment, and that calling
 * init() does not blow up the bootstrap.
 */
class ModuleActivationTest extends DolibarrRealTestCase
{
    public function testDolibarrEnvironmentIsReady(): void
    {
        $this->assertNotNull($this->db, 'Dolibarr $db must be initialized.');
        $this->assertNotNull($this->testUser, 'Dolibarr admin $user must be loaded.');
        $this->assertGreaterThan(0, (int) $this->testUser->id, 'Admin user id must be > 0.');
    }

    public function testModuleDescriptorLoadsAndInitializes(): void
    {
        $projectRoot = dirname(__DIR__, 3);
        $modFile = $projectRoot . '/core/modules/modDolipocket.class.php';

        $this->assertFileExists($modFile, 'Module descriptor file must exist.');

        require_once $modFile;
        $this->assertTrue(class_exists('modDolipocket'), 'modDolipocket class must be loaded.');

        // Use activateModule() instead of $mod->init() so cascading dependencies
        // (modSmartAuth, etc.) get their tables and constants created too.
        require_once DOL_DOCUMENT_ROOT . '/core/lib/admin.lib.php';
        $previousErrorReporting = error_reporting(E_ALL & ~E_WARNING & ~E_DEPRECATED);
        $module = new \modDolipocket($this->db);
        $ret = activateModule('modDolipocket');
        error_reporting($previousErrorReporting);

        if (!empty($ret['errors'])) {
            // Log the error so a CI failure has a reason in the output.
            fwrite(STDERR, 'activateModule(modDolipocket) errors: ' . implode(' | ', $ret['errors']) . "\n");
            throw new \RuntimeException('activateModule failed: ' . implode(' | ', $ret['errors']));
        }

        // We do not assert success of activateModule() with a strict equality
        // because Dolibarr SQLite may emit non-fatal warnings (existing
        // constants, etc.). We assert the module class loaded and is usable.
        $this->assertIsObject($module, 'Module instance must be available after init().');
        $this->assertSame('Dolipocket', $module->name, 'Module name must match descriptor declaration.');
    }
}
