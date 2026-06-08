<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\UserController;

/**
 * Integration tests for the read-only User controller used by the AutoForm
 * <FkPicker> for fk_user_* lookups (Lot 9).
 */
class UserControllerTest extends DolibarrRealTestCase
{
    /** @var UserController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        require_once dirname(__DIR__, 3) . '/smartmaker-api/UserController.php';
        require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['user'] = 'user';
        if (!isset($conf->user)) {
            $conf->user = new \stdClass();
        }
        $conf->user->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->user)) {
            $user->rights->user = new \stdClass();
        }
        if (!isset($user->rights->user->user)) {
            $user->rights->user->user = new \stdClass();
        }
        if (!isset($user->rights->user->self)) {
            $user->rights->user->self = new \stdClass();
        }
        $user->rights->user->user->lire = 1;
        $user->rights->user->self->creer = 1;

        $this->controller = new UserController();
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

    public function testIndexEntriesExposeFkPickerShape(): void
    {
        [$data] = $this->controller->index(['limit' => 5]);

        if (empty($data['items'])) {
            $this->markTestSkipped('No active users in fixture, cannot assert shape.');
        }

        $first = $data['items'][0];
        $this->assertArrayHasKey('id', $first);
        $this->assertArrayHasKey('login', $first);
        $this->assertArrayHasKey('fullname', $first);
        $this->assertArrayHasKey('label', $first);
    }

    public function testIndexAcceptsSearchParam(): void
    {
        [, $code] = $this->controller->index(['search' => 'unlikely-xyz-zzz']);

        $this->assertSame(200, $code);
    }

    public function testIndexReturns403WhenRightsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->user->user->lire = 0;
        $user->rights->user->self->creer = 0;

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
