<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\TaskController;

/**
 * Integration smoke tests for the project task controller (lot B3). Confirms
 * the dmTask mapper boots and the endpoints answer with the right shapes /
 * status codes at runtime.
 */
class TaskControllerTest extends DolibarrRealTestCase
{
    /** @var TaskController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        // The controller is backed by dmTask (extends SmartAuth dmBase), so the
        // smartauth autoload must be present -- as the prepend loads it in prod.
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/TaskController.php';
        require_once DOL_DOCUMENT_ROOT . '/projet/class/task.class.php';

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
        $user->rights->projet->creer = 1;

        $this->controller = new TaskController();
    }

    public function testIndexReturnsArrayWithoutListParams(): void
    {
        [$data, $code] = $this->controller->index(null);

        $this->assertSame(200, $code);
        $this->assertIsArray($data);
    }

    public function testIndexPaginatedEnvelope(): void
    {
        [$data, $code] = $this->controller->index(['page' => 1, 'limit' => 5]);

        $this->assertSame(200, $code);
        $this->assertArrayHasKey('items', $data);
        $this->assertArrayHasKey('total', $data);
        $this->assertSame(1, $data['page']);
        $this->assertSame(5, $data['limit']);
    }

    public function testIndexUnknownProjectReturns404(): void
    {
        [$data, $code] = $this->controller->index(['project' => 999999999]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testColumnsCatalogIsArray(): void
    {
        [$data, $code] = $this->controller->columns(null);

        $this->assertSame(200, $code);
        $this->assertIsArray($data);
    }

    public function testShowMissingIdReturns400(): void
    {
        [$data, $code] = $this->controller->show([]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testShowUnknownReturns404(): void
    {
        [$data, $code] = $this->controller->show(['id' => 999999999]);

        $this->assertSame(404, $code);
        $this->assertArrayHasKey('error', $data);
    }

    public function testForbiddenWithoutReadRight(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->projet->lire = 0;

        [$data, $code] = $this->controller->index(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }

    /**
     * End-to-end timesheet flow (lot B4): create a public project + a task,
     * then add / list / summarize / delete a time entry. Exercises the element_
     * time insert, the duration_effective SUM recompute, fetchTimeSpentOnTask
     * and delTimeSpent on the real SQLite schema.
     */
    public function testTimesheetFullFlow(): void
    {
        global $db, $user, $conf;

        require_once DOL_DOCUMENT_ROOT . '/projet/class/project.class.php';

        $project = new \Project($db);
        $project->ref = 'PJ-TS-' . rand(100000, 999999);
        $project->title = 'Timesheet test';
        $project->public = 1; // so restrictedProjectArea('write') passes for creer
        $project->entity = $conf->entity;
        $projectId = $project->create($user);
        $this->assertGreaterThan(0, $projectId, 'project must be created');

        [$taskData, $codeCreate] = $this->controller->create(array('fk_project' => $projectId, 'label' => 'Task TS'));
        $this->assertSame(201, $codeCreate, 'task create must return 201');
        $taskId = (int) $taskData->id;
        $this->assertGreaterThan(0, $taskId);

        // Empty timesheet.
        [$t0, $c0] = $this->controller->timeList(array('id' => $taskId));
        $this->assertSame(200, $c0);
        $this->assertArrayHasKey('lines', $t0);
        $this->assertCount(0, $t0['lines']);

        // Add 2h (7200 s).
        [$t1, $c1] = $this->controller->timeAdd(array('id' => $taskId, 'duration' => 7200, 'note' => 'work'));
        $this->assertSame(200, $c1);
        $this->assertCount(1, $t1['lines']);
        $this->assertSame(7200, (int) $t1['lines'][0]['duration']);
        $tsId = (int) $t1['lines'][0]['id'];
        $this->assertGreaterThan(0, $tsId);

        // Summary reflects the entry.
        [$sum, $c2] = $this->controller->timeSummary(array('id' => $taskId));
        $this->assertSame(200, $c2);
        $this->assertSame(7200, (int) $sum['totalDuration']);

        // Delete leaves the timesheet empty.
        [$t2, $c3] = $this->controller->timeDelete(array('id' => $taskId, 'tsid' => $tsId));
        $this->assertSame(200, $c3);
        $this->assertCount(0, $t2['lines']);
    }
}
