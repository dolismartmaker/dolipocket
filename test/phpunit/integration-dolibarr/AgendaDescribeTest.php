<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\AgendaController;

/**
 * Integration tests for the agenda AutoForm describe endpoint.
 *
 * Covers:
 *  - GET /agenda/describe returns 200 with a stdClass keyed per appside field.
 *  - The event type (type_code) is resolved to a populated <select> via the
 *    c_actioncomm dictionary (dmAgenda::$parentFieldsOverride sellist), so the
 *    desktop form shows French type labels instead of a raw text input.
 *  - Without the agenda.myactions.read right the endpoint returns 403.
 */
class AgendaDescribeTest extends DolibarrRealTestCase
{
    /** @var AgendaController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmAgenda.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/AgendaController.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/action/class/actioncomm.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['agenda'] = 'agenda';
        if (!isset($conf->agenda)) {
            $conf->agenda = new \stdClass();
        }
        $conf->agenda->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->agenda)) {
            $user->rights->agenda = new \stdClass();
        }
        if (!isset($user->rights->agenda->myactions)) {
            $user->rights->agenda->myactions = new \stdClass();
        }
        $user->rights->agenda->myactions->read = 1;

        $this->controller = new AgendaController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code, 'describe endpoint must return 200');
        $this->assertInstanceOf(\stdClass::class, $data, 'describe must return a stdClass');

        $vars = get_object_vars($data);
        $this->assertNotEmpty($vars, 'describe payload must not be empty');
        // Keys are the appside names from dmAgenda::$listOfPublishedFields.
        $this->assertArrayHasKey('label', $vars, 'describe must expose label');
        $this->assertArrayHasKey('type_code', $vars, 'describe must expose type_code');
        $this->assertArrayHasKey('note', $vars, 'describe must expose note (note_private appside)');
    }

    public function testTypeCodeIsResolvedToSelectFromDictionary(): void
    {
        [$data] = $this->controller->describe(null);

        // dmAgenda::$parentFieldsOverride declares type_code as
        // sellist:c_actioncomm:libelle:code. propertiesFilter must resolve it to
        // a populated <select> so the AutoForm renders translated action types.
        $type = $data->type_code ?? null;
        $this->assertNotNull($type, 'type_code entry must exist');
        $this->assertIsArray($type);
        $this->assertSame('select', $type['type'], 'type_code must be typed select');
        $this->assertArrayHasKey('options', $type, 'sellist must carry an options array');
        $this->assertIsArray($type['options']);
        $this->assertNotEmpty($type['options'], 'c_actioncomm dictionary must populate the type select');

        // Option shape consumed by the smartcommon <Select>: { label, value }.
        $first = $type['options'][0];
        $this->assertArrayHasKey('label', $first, 'each option must carry a label');
        $this->assertArrayHasKey('value', $first, 'each option must carry a value');
    }

    public function testDescribeReturns403WhenReadRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->agenda->myactions->read = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code, 'describe must reject users without agenda.myactions.read');
        $this->assertArrayHasKey('error', $data);
    }
}
