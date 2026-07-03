<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\AgendaController;

/**
 * Integration tests for AgendaController::index($arr).
 *
 * Guards the OPTI-DATA-ACCESS.md rework of the list endpoint:
 *  - single-query listing returns the calendar-shaped rows (incl. the `tms`
 *    delta watermark),
 *  - the start/end window filter includes/excludes correctly,
 *  - the `since` delta filter returns only rows modified after the watermark,
 *  - the endpoint is guarded by agenda.myactions.read.
 */
class AgendaControllerListTest extends DolibarrRealTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        global $user;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmAgenda.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/AgendaController.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/action/class/actioncomm.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        $this->grantAllRights();
    }

    /**
     * Create an event owned by the current user at a given start timestamp.
     */
    private function createEventAt(int $datep, string $typeCode = 'AC_OTH', int $percent = 0): \ActionComm
    {
        global $db, $user;

        $event = new \ActionComm($db);
        $event->label = 'List-' . uniqid();
        $event->type_code = $typeCode;
        $event->percentage = $percent;
        $event->datep = $datep;
        $event->userownerid = (int) $user->id;
        $event->userassigned = [
            (int) $user->id => ['id' => (int) $user->id, 'transparency' => 0],
        ];
        $r = $event->create($user);
        if ($r <= 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors)
                ? implode('; ', $event->errors)
                : (string) $event->error;
            $this->fail('createEventAt failed: ' . $errMsg);
        }
        $event->fetch($r);
        return $event;
    }

    private function idsOf(array $rows): array
    {
        return array_map(static fn ($r) => (int) $r['id'], $rows);
    }

    public function testIndexReturnsCreatedEventWithinWindow(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $event = $this->createEventAt($datep);
        $controller = new AgendaController();

        [$rows, $code] = $controller->index([
            'start' => $datep - 3600,
            'end'   => $datep + 3600,
        ]);

        $this->assertSame(200, $code);
        $this->assertIsArray($rows);
        $this->assertContains((int) $event->id, $this->idsOf($rows));

        // Shape: the moved-into row must carry the fields the calendar renders,
        // including the delta watermark tms.
        $found = null;
        foreach ($rows as $r) {
            if ((int) $r['id'] === (int) $event->id) {
                $found = $r;
                break;
            }
        }
        $this->assertNotNull($found);
        $this->assertSame($datep, (int) $found['datep']);
        $this->assertArrayHasKey('tms', $found);
        $this->assertGreaterThan(0, (int) $found['tms']);
        $this->assertSame((int) $found['fk_user_action'], (int) $found['fk_user_assigned']);
    }

    public function testIndexExcludesEventOutsideWindow(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $event = $this->createEventAt($datep);
        $controller = new AgendaController();

        // Window entirely BEFORE the event start -> datep <= end is false.
        [$rows, $code] = $controller->index([
            'start' => $datep - 7200,
            'end'   => $datep - 3600,
        ]);

        $this->assertSame(200, $code);
        $this->assertNotContains((int) $event->id, $this->idsOf($rows));
    }

    public function testIndexSinceInFutureReturnsNoRows(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $event = $this->createEventAt($datep);
        $controller = new AgendaController();

        // A watermark in the far future -> nothing was modified after it.
        [$rows, $code] = $controller->index([
            'start' => $datep - 3600,
            'end'   => $datep + 3600,
            'since' => dol_now() + 86400,
        ]);

        $this->assertSame(200, $code);
        $this->assertNotContains((int) $event->id, $this->idsOf($rows));
    }

    public function testIndexSinceInPastIncludesRecentlyChangedEvent(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $event = $this->createEventAt($datep);
        $controller = new AgendaController();

        // A watermark well in the past -> the just-created event is in the delta.
        [$rows, $code] = $controller->index([
            'start' => $datep - 3600,
            'end'   => $datep + 3600,
            'since' => dol_now() - 86400,
        ]);

        $this->assertSame(200, $code);
        $this->assertContains((int) $event->id, $this->idsOf($rows));
    }

    public function testIndexFilterByActioncode(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $event = $this->createEventAt($datep, 'AC_OTH');
        $controller = new AgendaController();
        $window = ['start' => $datep - 3600, 'end' => $datep + 3600];

        [$rows, $code] = $controller->index($window + ['actioncode' => 'AC_OTH']);
        $this->assertSame(200, $code);
        $this->assertContains((int) $event->id, $this->idsOf($rows));

        [$rows2] = $controller->index($window + ['actioncode' => 'AC_RDV']);
        $this->assertNotContains((int) $event->id, $this->idsOf($rows2));
    }

    public function testIndexHideAutoExcludesAutoEvent(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        // AC_OTH_AUTO has c_actioncomm.type = 'systemauto' in the fixture.
        $auto = $this->createEventAt($datep, 'AC_OTH_AUTO');
        $manual = $this->createEventAt($datep, 'AC_OTH');
        $controller = new AgendaController();
        $window = ['start' => $datep - 3600, 'end' => $datep + 3600];

        // Without the flag both are present.
        [$all] = $controller->index($window);
        $this->assertContains((int) $auto->id, $this->idsOf($all));
        $this->assertContains((int) $manual->id, $this->idsOf($all));

        // With hideAuto the systemauto event drops, the manual one stays.
        [$filtered, $code] = $controller->index($window + ['hideAuto' => 1]);
        $this->assertSame(200, $code);
        $this->assertNotContains((int) $auto->id, $this->idsOf($filtered));
        $this->assertContains((int) $manual->id, $this->idsOf($filtered));
    }

    public function testIndexStatusBuckets(): void
    {
        $datep = strtotime('2026-05-18 09:00:00');
        $todo = $this->createEventAt($datep, 'AC_OTH', 0);
        $done = $this->createEventAt($datep, 'AC_OTH', 100);
        $controller = new AgendaController();
        $window = ['start' => $datep - 3600, 'end' => $datep + 3600];

        [$todoRows, $code] = $controller->index($window + ['status' => 'todo']);
        $this->assertSame(200, $code);
        $this->assertContains((int) $todo->id, $this->idsOf($todoRows));
        $this->assertNotContains((int) $done->id, $this->idsOf($todoRows));

        [$doneRows] = $controller->index($window + ['status' => 'done']);
        $this->assertContains((int) $done->id, $this->idsOf($doneRows));
        $this->assertNotContains((int) $todo->id, $this->idsOf($doneRows));
    }

    public function testFilterOptionsReturnsTypesAndStatuses(): void
    {
        $controller = new AgendaController();
        [$data, $code] = $controller->filterOptions(null);

        $this->assertSame(200, $code);
        $this->assertIsArray($data);
        $this->assertArrayHasKey('types', $data);
        $this->assertArrayHasKey('groups', $data);
        $this->assertArrayHasKey('statuses', $data);

        // AC_OTH is an active type in the fixture -> must appear with its flag.
        $codes = array_column($data['types'], 'code');
        $this->assertContains('AC_OTH', $codes);

        $autoFlag = null;
        foreach ($data['types'] as $t) {
            if ($t['code'] === 'AC_OTH_AUTO') {
                $autoFlag = $t['systemauto'];
            }
        }
        if ($autoFlag !== null) {
            $this->assertTrue($autoFlag, 'AC_OTH_AUTO must be flagged systemauto');
        }

        // Fixed advancement buckets.
        $this->assertCount(5, $data['statuses']);
        $this->assertContains('todo', array_column($data['statuses'], 'value'));
    }

    private function insertContactBirthday(string $first, string $last, string $birthday): int
    {
        global $db, $conf, $user;

        $entity = (int) ($conf->entity ?? 1);
        $sql = 'INSERT INTO ' . MAIN_DB_PREFIX . 'socpeople (entity, firstname, lastname, birthday, priv, fk_user_creat)'
            . " VALUES (" . $entity . ", '" . $db->escape($first) . "', '" . $db->escape($last) . "', '"
            . $db->escape($birthday) . "', 0, " . ((int) $user->id) . ")";
        if (!$db->query($sql)) {
            $this->fail('insertContactBirthday failed: ' . $db->lasterror());
        }
        return (int) $db->last_insert_id(MAIN_DB_PREFIX . 'socpeople');
    }

    public function testIndexBirthdayVirtualEvents(): void
    {
        $cid = $this->insertContactBirthday('Alice', 'Martin', '1990-05-18');
        $controller = new AgendaController();
        $window = [
            'start' => strtotime('2026-05-01 00:00:00'),
            'end'   => strtotime('2026-05-31 23:59:59'),
        ];

        // Without the flag -> no birthday event.
        [$plain] = $controller->index($window);
        $this->assertNotContains(-$cid, $this->idsOf($plain));

        // With showbirthday -> a virtual event (negative id, BIRTHDAY, full day).
        [$withB, $code] = $controller->index($window + ['showbirthday' => 1]);
        $this->assertSame(200, $code);
        $this->assertContains(-$cid, $this->idsOf($withB));

        $bday = null;
        foreach ($withB as $e) {
            if ((int) $e['id'] === -$cid) {
                $bday = $e;
            }
        }
        $this->assertNotNull($bday);
        $this->assertSame('BIRTHDAY', $bday['type_code']);
        $this->assertSame(1, (int) $bday['fulldayevent']);
        $this->assertStringContainsString('Alice', $bday['label']);

        // Delta sync (since set) must NOT inject birthdays (they have no tms).
        [$delta] = $controller->index($window + ['showbirthday' => 1, 'since' => strtotime('2020-01-01')]);
        $this->assertNotContains(-$cid, $this->idsOf($delta));
    }

    public function testCountsBucketsOverWindow(): void
    {
        // Isolated 2020 window (other test methods seed at 2026) so the buckets
        // are deterministic. now() is well after 2020 -> the unfinished ones are
        // overdue.
        $e1 = $this->createEventAt(strtotime('2020-06-01 09:00:00'), 'AC_OTH', 0);   // todo + overdue
        $e2 = $this->createEventAt(strtotime('2020-06-02 09:00:00'), 'AC_OTH', 100); // done
        $e3 = $this->createEventAt(strtotime('2020-06-03 09:00:00'), 'AC_OTH', 50);  // todo + overdue
        $controller = new AgendaController();

        [$c, $code] = $controller->counts([
            'start' => strtotime('2020-05-01 00:00:00'),
            'end'   => strtotime('2020-07-01 00:00:00'),
        ]);

        $this->assertSame(200, $code);
        $this->assertSame(3, (int) $c['total']);
        $this->assertSame(2, (int) $c['todo']);
        $this->assertSame(1, (int) $c['done']);
        $this->assertSame(2, (int) $c['overdue']);
        // All three were created owned/assigned to the current user.
        $this->assertSame(3, (int) $c['mine']);

        // Silence "unused variable" static checks -- the ids anchor the intent.
        $this->assertGreaterThan(0, $e1->id + $e2->id + $e3->id);
    }

    public function testCountsDeniedWithoutReadRight(): void
    {
        global $user;
        $controller = new AgendaController();

        $user->admin = 0;
        $user->rights->agenda->myactions->read = 0;
        try {
            [$body, $code] = $controller->counts([]);
        } finally {
            $user->admin = 1;
            $user->rights->agenda->myactions->read = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testFilterOptionsDeniedWithoutReadRight(): void
    {
        global $user;
        $controller = new AgendaController();

        $user->admin = 0;
        $user->rights->agenda->myactions->read = 0;
        try {
            [$body, $code] = $controller->filterOptions(null);
        } finally {
            $user->admin = 1;
            $user->rights->agenda->myactions->read = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testIndexDeniedWithoutReadRight(): void
    {
        global $user;
        $controller = new AgendaController();

        $user->admin = 0;
        $user->rights->agenda->myactions->read = 0;
        try {
            [$body, $code] = $controller->index([]);
        } finally {
            $user->admin = 1;
            $user->rights->agenda->myactions->read = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['agenda', 'societe'];
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        foreach ($modules as $m) {
            $conf->modules[$m] = $m;
            if (!isset($conf->$m) || !is_object($conf->$m)) {
                $conf->$m = new \stdClass();
            }
            $conf->$m->enabled = 1;
        }

        if (!isset($user->rights->agenda)) {
            $user->rights->agenda = new \stdClass();
        }
        foreach (['myactions', 'allactions'] as $sub) {
            if (!isset($user->rights->agenda->$sub)) {
                $user->rights->agenda->$sub = new \stdClass();
            }
            $user->rights->agenda->$sub->read = 1;
            $user->rights->agenda->$sub->create = 1;
            $user->rights->agenda->$sub->delete = 1;
        }
    }
}
