<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\ContactController;

/**
 * Integration tests for the DataTable v2 column catalog endpoint on Contact.
 * Mirrors ThirdPartyColumnsTest. Cf docs/DATATABLE_SPEC.md §13.
 */
class ContactColumnsTest extends DolibarrRealTestCase
{
    /** @var ContactController */
    private $controller;

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $conf;

        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
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

        $this->controller = new ContactController();
    }

    public function testColumnsReturnsArrayOfDescriptors(): void
    {
        [$data, $code] = $this->controller->columns(null);

        $this->assertSame(200, $code);
        $this->assertIsArray($data);
        $this->assertNotEmpty($data);

        foreach ($data as $col) {
            $this->assertIsArray($col);
            $this->assertArrayHasKey('key', $col);
            $this->assertArrayHasKey('label', $col);
            $this->assertArrayHasKey('type', $col);
            $this->assertArrayHasKey('sortable', $col);
            $this->assertArrayHasKey('filterable', $col);
            $this->assertArrayHasKey('group', $col);
        }
    }

    public function testCatalogContainsLastnameColumn(): void
    {
        [$data] = $this->controller->columns(null);

        $byKey = array_column($data, null, 'key');
        $this->assertArrayHasKey('lastname', $byKey, 'catalog must expose the lastname column');
        $this->assertTrue((bool) $byKey['lastname']['sortable']);
    }
}
