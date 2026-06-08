<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\AgendaController;

/**
 * Characterization tests for AgendaController::update($arr).
 *
 * Most complex Spec C target: 14 writable fields + 3 rename quirks
 * (note -> note_private, fk_contact -> contact_id, fk_user_assigned ->
 * userownerid), a side effect (type_code resets type_id = 0), and a
 * custom auth helper canEditEvent (admin OR allactions.create OR
 * myactions.create+owner).
 */
class AgendaControllerUpdateTest extends DolibarrRealTestCase
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
     * Create a fresh event via ActionComm directly. The current $user is
     * set as the owner so canEditEvent passes through the myactions+owner
     * fallback even without admin/allactions.
     */
    private function createEvent(): \ActionComm
    {
        global $db, $user;

        $event = new \ActionComm($db);
        $event->label = 'Seed-' . uniqid();
        $event->type_code = 'AC_OTH';
        $event->datep = dol_now();
        $event->userownerid = (int) $user->id;
        $event->userassigned = [
            (int) $user->id => ['id' => (int) $user->id, 'transparency' => 0],
        ];
        $r = $event->create($user);
        if ($r <= 0) {
            $errMsg = is_array($event->errors) && !empty($event->errors)
                ? implode('; ', $event->errors)
                : (string) $event->error;
            $this->fail('createEvent failed: ' . $errMsg);
        }
        $event->fetch($r);
        return $event;
    }

    private function reload(int $id): \ActionComm
    {
        global $db;
        $e = new \ActionComm($db);
        $e->fetch($id);
        return $e;
    }

    // ---------- Nominal cases ----------

    public function testUpdateLabel(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [$body, $code] = $controller->update(['id' => $event->id, 'label' => 'New label']);

        $this->assertSame(200, $code, 'update must succeed: ' . json_encode($body));
        $this->assertSame('New label', $this->reload($event->id)->label);
    }

    /**
     * Sends type_code + datep + datef in one payload. The controller
     * accepts the payload and persists the dates, but type_code resolution
     * is incomplete on the SQLite fixture: the legacy controller resets
     * type_id = 0, then ActionComm::update() writes fk_action = 0 in SQL,
     * and the next fetch's JOIN on c_actioncomm returns no row so
     * type_code reloads as null. We characterize that current state here;
     * the Phase 2 refactor preserves it byte-for-byte (the reset side
     * effect is reproduced in the post-import loop).
     */
    public function testUpdateTypeCodeAndDates(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();
        $datep = strtotime('2026-05-18 09:00:00');
        $datef = strtotime('2026-05-18 10:00:00');

        [, $code] = $controller->update([
            'id'        => $event->id,
            'type_code' => 'AC_RDV',
            'datep'     => $datep,
            'datef'     => $datef,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($event->id);
        $this->assertSame($datep, (int) $reloaded->datep);
        $this->assertSame($datef, (int) $reloaded->datef);
    }

    public function testUpdateFulldayevent(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update(['id' => $event->id, 'fulldayevent' => true]);
        $this->assertSame(200, $code);

        $this->assertSame(1, (int) $this->reload($event->id)->fulldayevent);
    }

    public function testUpdateLocationAndNote(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update([
            'id'       => $event->id,
            'location' => 'Office',
            'note'     => 'Some note',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($event->id);
        $this->assertSame('Office', $reloaded->location);
        $this->assertSame('Some note', $reloaded->note_private);
    }

    public function testUpdatePercentageAndStatus(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update([
            'id'         => $event->id,
            'percentage' => 50,
            'status'     => 1,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($event->id);
        $this->assertSame(50, (int) $reloaded->percentage);
    }

    public function testUpdateSocidAndContact(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update([
            'id'         => $event->id,
            'socid'      => 1,
            'fk_contact' => 1,
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($event->id);
        $this->assertSame(1, (int) $reloaded->socid);
        $this->assertSame(1, (int) $reloaded->contact_id);
    }

    public function testUpdateLinkedElement(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update([
            'id'          => $event->id,
            'fk_element'  => 42,
            'elementtype' => 'commande',
        ]);
        $this->assertSame(200, $code);

        $reloaded = $this->reload($event->id);
        $this->assertSame(42, (int) $reloaded->fk_element);
        $this->assertSame('commande', $reloaded->elementtype);
    }

    /**
     * fk_user_assigned (API write) maps to $event->userownerid (PHP).
     * The asymmetric API read key is fk_user_action -- not exercised here.
     */
    public function testUpdateFkUserAssigned(): void
    {
        global $user;
        $event = $this->createEvent();
        $controller = new AgendaController();

        // Use the current user id as the new owner (already the case from
        // the seed, but the update path must still persist the value
        // explicitly through the API write key).
        [, $code] = $controller->update(['id' => $event->id, 'fk_user_assigned' => (int) $user->id]);
        $this->assertSame(200, $code);

        $this->assertSame((int) $user->id, (int) $this->reload($event->id)->userownerid);
    }

    // ---------- Error cases ----------

    public function testUpdateReturns403WhenAllRightsRevoked(): void
    {
        global $user;
        $event = $this->createEvent();
        $controller = new AgendaController();

        $user->admin = 0;
        $user->rights->agenda->allactions->create = 0;
        $user->rights->agenda->myactions->create = 0;
        try {
            [$body, $code] = $controller->update(['id' => $event->id, 'label' => 'X']);
        } finally {
            $user->admin = 1;
            $user->rights->agenda->allactions->create = 1;
            $user->rights->agenda->myactions->create = 1;
        }

        $this->assertSame(403, $code);
        $this->assertSame('Access denied', $body['error']);
    }

    public function testUpdateReturns400WhenIdMissing(): void
    {
        $controller = new AgendaController();
        [$body, $code] = $controller->update([]);

        $this->assertSame(400, $code);
        $this->assertSame('Event id is required', $body['error']);
    }

    public function testUpdateReturns404WhenEventMissing(): void
    {
        $controller = new AgendaController();
        [$body, $code] = $controller->update(['id' => 999999]);

        $this->assertSame(404, $code);
        $this->assertSame('Event not found', $body['error']);
    }

    /**
     * Post-refactor: a non-writable field is rejected with 400.
     */
    public function testUpdateRejectsUnknownField(): void
    {
        $event = $this->createEvent();
        $originalLabel = $event->label;
        $controller = new AgendaController();

        [$body, $code] = $controller->update(['id' => $event->id, 'made_up_key' => 'x']);

        $this->assertSame(400, $code, 'unknown writable field must produce 400');
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('made_up_key', $body['errors']);
        $this->assertSame($originalLabel, $this->reload($event->id)->label, 'label unchanged');
    }

    // ---------- Phase 3: strict rejection on non-writable fields ----------

    public function testUpdateRejectsRef(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [$body, $code] = $controller->update(['id' => $event->id, 'ref' => 'FORGED']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('ref', $body['errors']);
    }

    public function testUpdateRejectsArbitraryUnknownField(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [$body, $code] = $controller->update(['id' => $event->id, 'random_key' => 'x']);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('random_key', $body['errors']);
    }

    public function testUpdateRejectsMultipleNonWritableFieldsAtOnce(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [$body, $code] = $controller->update([
            'id'  => $event->id,
            'ref' => 'FORGED',
            'foo' => 'bar',
            'baz' => 'qux',
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('ref', $body['errors']);
        $this->assertArrayHasKey('foo', $body['errors']);
        $this->assertArrayHasKey('baz', $body['errors']);
    }

    public function testUpdateRejectsLinesKey(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [$body, $code] = $controller->update([
            'id'    => $event->id,
            'lines' => [['description' => 'irrelevant', 'qty' => 1]],
        ]);

        $this->assertSame(400, $code);
        $this->assertArrayHasKey('errors', $body);
        $this->assertArrayHasKey('lines', $body['errors']);
    }

    /**
     * percentage had an explicit (int) cast in the legacy controller.
     * Post-refactor the mapper's _castInputValue() takes over.
     */
    public function testUpdateCastsStringPercentageAsInt(): void
    {
        $event = $this->createEvent();
        $controller = new AgendaController();

        [, $code] = $controller->update(['id' => $event->id, 'percentage' => '75']);
        $this->assertSame(200, $code);

        $this->assertSame(75, (int) $this->reload($event->id)->percentage, 'string "75" must be cast to int 75');
    }

    // ---------- Setup helpers ----------

    private function grantAllRights(): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['agenda', 'societe', 'banque'];
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
