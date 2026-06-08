<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ContactController;

/**
 * Integration tests for the AutoForm describe endpoint on contacts.
 * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
 */
class ContactDescribeTest extends DolibarrRealTestCase
{
    /** @var ContactController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/dmContact.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/ContactController.php';
        require_once DOL_DOCUMENT_ROOT . '/contact/class/contact.class.php';

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
        if (!isset($user->rights->societe->contact)) {
            $user->rights->societe->contact = new \stdClass();
        }
        $user->rights->societe->contact->lire = 1;
        $user->rights->societe->lire = 1;

        $this->controller = new ContactController();
    }

    public function testDescribeReturnsStdClassKeyedPerField(): void
    {
        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(200, $code);
        $this->assertInstanceOf(\stdClass::class, $data);
        $this->assertNotEmpty(get_object_vars($data));
    }

    public function testDescribeContainsExpectedContactFields(): void
    {
        [$data] = $this->controller->describe(null);
        $vars = get_object_vars($data);

        $this->assertArrayHasKey('lastname', $vars);
        $this->assertArrayHasKey('firstname', $vars);
        $this->assertArrayHasKey('fk_soc', $vars);
    }

    public function testDescribeReturns403WhenLireRightsAreMissing(): void
    {
        global $user;
        $user->admin = 0;
        $user->rights->societe->contact->lire = 0;
        $user->rights->societe->lire = 0;

        [$data, $code] = $this->controller->describe(null);

        $this->assertSame(403, $code);
        $this->assertArrayHasKey('error', $data);
    }
}
