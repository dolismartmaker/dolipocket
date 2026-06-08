<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProjectController;

/**
 * Integration tests for the read-only Project controller used by the
 * AutoForm <FkPicker> for fk_projet lookups (Lot 9).
 */
class ProjectControllerTest extends DolibarrRealTestCase
{
    /** @var ProjectController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProjectController.php';
        require_once DOL_DOCUMENT_ROOT . '/projet/class/project.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['projet'] = 'projet';
        if (!isset($conf->projet)) {
            $conf->projet = new \stdClass();
        }
        $conf->projet->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->projet)) {
            $user->rights->projet = new \stdClass();
        }
        $user->rights->projet->lire = 1;

        $this->controller = new ProjectController();
    }

    public function testIndexReturnsPaginatedEnvelope(): void
    {
        [$data, $code] = $this->controller->index(null);

        $this->assertSame(200, $code);
        $this->assertIsArray($data);
        $this->assertArrayHasKey('items', $data);
        $this->assertArrayHasKey('total', $data);
        $this->assertArrayHasKey('page', $data);
        $this->assertArrayHasKey('limit', $data);
        $this->assertIsArray($data['items']);
    }

    public function testIndexHonoursLimitAndPage(): void
    {
        [$data, $code] = $this->controller->index(['page' => 1, 'limit' => 5]);

        $this->assertSame(200, $code);
        $this->assertSame(1, $data['page']);
        $this->assertSame(5, $data['limit']);
        $this->assertLessThanOrEqual(5, count($data['items']));
    }

    public function testIndexAcceptsSearchParam(): void
    {
        [, $code] = $this->controller->index(['search' => 'unlikely-xyz-zzz']);

        // No project will match, but the endpoint must still return 200 with
        // an empty items array rather than 500 / SQL error.
        $this->assertSame(200, $code);
    }

    public function testIndexReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->projet->lire = 0;

        [$data, $code] = $this->controller->index(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testShowReturns400WithoutId(): void
    {
        [$data, $code] = $this->controller->show([]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testShowReturns404WhenIdUnknown(): void
    {
        [$data, $code] = $this->controller->show(['id' => 999999999]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
