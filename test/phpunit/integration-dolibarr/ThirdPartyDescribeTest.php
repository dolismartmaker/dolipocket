<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ThirdPartyController;

/**
 * Integration tests for the AutoForm describe endpoint on third parties.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class ThirdPartyDescribeTest extends DolibarrRealTestCase
{
    /** @var ThirdPartyController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmThirdParty.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ThirdPartyController.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        $user->admin = 1;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        $conf->modules['societe'] = 'societe';
        if (!isset($conf->societe)) {
            $conf->societe = new \stdClass();
        }
        $conf->societe->enabled = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }
        if (!isset($user->rights->societe)) {
            $user->rights->societe = new \stdClass();
        }
        $user->rights->societe->lire = 1;

        $this->controller = new ThirdPartyController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedThirdPartyFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        // dmThirdParty exposes the appside synonym `name` for `nom`.
        $this->assertArrayHasKey('name', $vars);
        $this->assertArrayHasKey('code_client', $vars);
    }

    public function testDescribeReturns403WhenLireRightIsMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->societe->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
