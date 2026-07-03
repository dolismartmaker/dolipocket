<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ResourceController;

/**
 * Integration tests for the read-only ResourceController (agenda filter picker).
 *
 * Covers: paginated list envelope, ref/description search, show by id, and the
 * resource.read permission gate.
 */
class ResourceControllerTest extends DolibarrRealTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        require_once dirname(__DIR__, 3) . '/smartmaker-api/ResourceController.php';

        // hasRight('resource','read') returns 0 unless the module is enabled.
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['resource'] = 'resource';
        if (!isset($conf->resource) || !is_object($conf->resource)) {
            $conf->resource = new \stdClass();
        }
        $conf->resource->enabled = 1;

        $user->admin = 1;
        if (!isset($user->rights) || !is_object($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->resource) || !is_object($user->rights->resource)) {
            $user->rights->resource = new \stdClass();
        }
        $user->rights->resource->read = 1;
    }

    private function insertResource(string $ref, string $description = ''): int
    {
        global $db, $conf;

        $entity = (int) ($conf->entity ?? 1);
        $sql = 'INSERT INTO ' . MAIN_DB_PREFIX . 'resource (entity, ref, description)'
            . " VALUES (" . $entity . ", '" . $db->escape($ref) . "', '" . $db->escape($description) . "')";
        $res = $db->query($sql);
        if (!$res) {
            $this->fail('insertResource failed: ' . $db->lasterror());
        }
        return (int) $db->last_insert_id(MAIN_DB_PREFIX . 'resource');
    }

    private function refsOf(array $items): array
    {
        return array_map(static fn ($i) => $i['ref'], $items);
    }

    public function testIndexReturnsEnvelopeWithResource(): void
    {
        $this->insertResource('Salle Alpha');
        $controller = new ResourceController();

        [$data, $code] = $controller->index([]);

        $this->assertSame(200, $code);
        $this->assertArrayHasKey('items', $data);
        $this->assertArrayHasKey('total', $data);
        $this->assertArrayHasKey('page', $data);
        $this->assertArrayHasKey('limit', $data);
        $this->assertContains('Salle Alpha', $this->refsOf($data['items']));

        // Shape: each item carries id + ref + label for the FkPicker.
        $found = null;
        foreach ($data['items'] as $i) {
            if ($i['ref'] === 'Salle Alpha') {
                $found = $i;
            }
        }
        $this->assertNotNull($found);
        $this->assertGreaterThan(0, (int) $found['id']);
        $this->assertSame('Salle Alpha', $found['label']);
    }

    public function testIndexSearchFilters(): void
    {
        $this->insertResource('Vehicule Utilitaire', 'camionnette');
        $controller = new ResourceController();

        [$hit] = $controller->index(['search' => 'Utilitaire']);
        $this->assertContains('Vehicule Utilitaire', $this->refsOf($hit['items']));

        // Search also matches the description.
        [$byDesc] = $controller->index(['search' => 'camionnette']);
        $this->assertContains('Vehicule Utilitaire', $this->refsOf($byDesc['items']));

        [$miss] = $controller->index(['search' => 'ZZZ-none-XYZ']);
        $this->assertNotContains('Vehicule Utilitaire', $this->refsOf($miss['items']));
    }

    public function testShowReturnsResource(): void
    {
        $id = $this->insertResource('Projecteur 4K');
        $controller = new ResourceController();

        [$data, $code] = $controller->show(['id' => $id]);
        $this->assertSame(200, $code);
        $this->assertSame($id, (int) $data['id']);
        $this->assertSame('Projecteur 4K', $data['ref']);
    }

    public function testShowMissingReturns404(): void
    {
        $controller = new ResourceController();
        [$body, $code] = $controller->show(['id' => 999999]);
        $this->assertSame(404, $code);
        $this->assertSame('Resource not found', $body['error']);
    }

    public function testForbiddenWithoutRight(): void
    {
        global $user;
        $controller = new ResourceController();

        $user->admin = 0;
        $user->rights->resource->read = 0;
        try {
            [$body, $code] = $controller->index([]);
        } finally {
            $user->admin = 1;
            $user->rights->resource->read = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Forbidden', $body['error']);
    }
}
