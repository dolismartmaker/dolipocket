<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ProposalController;

/**
 * Integration tests for the AutoForm describe endpoint (Lot 9).
 *
 * Covers:
 *  - GET /proposal/describe returns 200 with a stdClass keyed per appside field.
 *  - Each entry carries the propertiesFilter contract (type, label, visible, ...).
 *  - The well-known proposal columns are present (ref, fk_soc, datep, total_ht).
 *  - Without the propal.lire right the endpoint returns 403.
 */
class ProposalDescribeTest extends DolibarrRealTestCase
{
    /** @var ProposalController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmProposal.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ProposalController.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['propal'] = 'propal';
        if (!isset($conf->propal)) {
            $conf->propal = new \stdClass();
        }
        $conf->propal->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->propal)) {
            $user->rights->propal = new \stdClass();
        }
        $user->rights->propal->lire = 1;

        $this->controller = new ProposalController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code, 'describe endpoint must return 200');
        $this->assertInstanceOf(\stdClass::class, $data, 'describe must return a stdClass');

        $vars = get_object_vars($data);
        $this->assertNotEmpty($vars, 'describe payload must not be empty');
    }

    public function testDescribeContainsExpectedProposalFields(): void
    {
        [$data] = $this->controller->describe(null);

        // Keys come from dmProposal::$listOfPublishedFields (snake_case appside).
        $vars = get_object_vars($data);
        $this->assertArrayHasKey('ref', $vars, 'describe must expose ref');
        $this->assertArrayHasKey('fk_soc', $vars, 'describe must expose fk_soc');
        $this->assertArrayHasKey('datep', $vars, 'describe must expose datep');
        $this->assertArrayHasKey('total_ht', $vars, 'describe must expose total_ht');
    }

    public function testDescribeFieldsCarryPropertiesFilterContract(): void
    {
        [$data] = $this->controller->describe(null);

        // Each field entry is the array produced by dmHelper::propertiesFilter,
        // which always sets at least `type` and `label` when the dolibarr field
        // definition provides them.
        $ref = $data->ref ?? null;
        $this->assertNotNull($ref, 'ref entry must exist');
        $this->assertIsArray($ref);
        $this->assertArrayHasKey('type', $ref, 'ref entry must carry a type');

        // datep is a date-typed column and must surface a `date` type.
        $datep = $data->datep ?? null;
        $this->assertNotNull($datep, 'datep entry must exist');
        $this->assertIsArray($datep);
        $this->assertArrayHasKey('type', $datep);
        $this->assertSame('date', $datep['type'], 'datep must be typed as date');
    }

    public function testDescribeReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->propal->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code, 'describe must reject users without propal.lire');
        $this->assertIsArray($data);
        $this->assertArrayHasKey('error', $data);
    }
}
