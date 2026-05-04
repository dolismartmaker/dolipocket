<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use PHPUnit\Framework\TestCase;

/**
 * Base class for Dolibarr SQLite integration tests.
 *
 * Exposes $db, $testUser, $conf populated by the bootstrap, and provides
 * helpers to assert on database state.
 */
abstract class DolibarrRealTestCase extends TestCase
{
    /**
     * @var \DoliDB Database handler
     */
    protected $db;

    /**
     * @var \User Test user (admin)
     */
    protected $testUser;

    /**
     * @var object Configuration
     */
    protected $conf;

    protected function setUp(): void
    {
        global $db, $conf, $user;

        $this->db = $db;
        $this->conf = $conf;
        $this->testUser = $user;

        // Wipe Dolipocket-owned rows between tests so each test starts with
        // a clean slate. Core Dolibarr tables (societe, contact, etc.) are
        // intentionally left alone -- they may be shared with bootstrap seed.
        $this->cleanModuleTables();
    }

    /**
     * Truncate Dolipocket-owned tables. Called from setUp() so tests do not
     * have to repeat the cleanup boilerplate.
     */
    protected function cleanModuleTables(): void
    {
        $tables = ['dolipocket_tenant'];
        foreach ($tables as $t) {
            $this->db->query('DELETE FROM ' . MAIN_DB_PREFIX . $t);
        }
    }

    /**
     * Assert that a record exists in the given table.
     *
     * @param string                $table      Table name without the llx_ prefix.
     * @param array<string, mixed>  $conditions Column => value pairs.
     */
    protected function assertDatabaseHas(string $table, array $conditions): void
    {
        $where = [];
        foreach ($conditions as $column => $value) {
            if ($value === null) {
                $where[] = "$column IS NULL";
            } else {
                $where[] = "$column = '" . $this->db->escape($value) . "'";
            }
        }

        $sql = 'SELECT COUNT(*) AS cnt FROM ' . MAIN_DB_PREFIX . $table;
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $result = $this->db->query($sql);
        $obj = $this->db->fetch_object($result);

        $this->assertGreaterThan(
            0,
            (int) $obj->cnt,
            "Table '$table' should contain: " . json_encode($conditions)
        );
    }

    /**
     * Assert that no record matches the given conditions.
     *
     * @param string                $table      Table name without the llx_ prefix.
     * @param array<string, mixed>  $conditions Column => value pairs.
     */
    protected function assertDatabaseMissing(string $table, array $conditions): void
    {
        $where = [];
        foreach ($conditions as $column => $value) {
            if ($value === null) {
                $where[] = "$column IS NULL";
            } else {
                $where[] = "$column = '" . $this->db->escape($value) . "'";
            }
        }

        $sql = 'SELECT COUNT(*) AS cnt FROM ' . MAIN_DB_PREFIX . $table;
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $result = $this->db->query($sql);
        $obj = $this->db->fetch_object($result);

        $this->assertEquals(
            0,
            (int) $obj->cnt,
            "Table '$table' should not contain: " . json_encode($conditions)
        );
    }
}
