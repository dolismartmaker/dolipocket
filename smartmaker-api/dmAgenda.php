<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 */

namespace Dolipocket\Api;

dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping class for ActionComm (agenda events)
 *
 * Maps Dolibarr ActionComm fields to the API field names consumed by the
 * mobile PWA. Extrafields are loaded from admin settings to keep the schema
 * configurable without redeploying the module.
 */
class dmAgenda extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'ActionComm';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'actioncomm';

    /**
     * Element name used by dmCatalogTrait to enumerate extrafields. Required
     * for the catalog endpoints to flag extrafields with group=extrafield.
     * Matches llx_extrafields.elementtype like the legacy
     * $parentElementToUseForExtraFields above.
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'actioncomm';

    /**
     * Field-level overrides applied by dmTrait::propertiesFilter() at boot.
     *
     * ActionComm exposes the event type as a free `type_code` string (AC_RDV,
     * AC_TEL, ...). Left as-is the describe()/AutoForm renders a raw text input.
     * Declaring it as a sellist onto the c_actioncomm dictionary turns it into a
     * translated <select> (Rendez-vous, Appel telephonique, Email...) sourced
     * from the tenant's active action types -- no hardcoded list front-side.
     * @var array
     */
    protected $parentFieldsOverride = [
        'type_code' => ['type' => 'sellist:c_actioncomm:libelle:code'],
    ];

    /**
     * Mapping: Dolibarr field name => API field name
     * @var array
     */
    protected $listOfPublishedFields = [
        'id'             => 'id',
        'ref'            => 'ref',
        'label'          => 'label',
        'type_code'      => 'type_code',
        'datep'          => 'datep',
        'datef'          => 'datef',
        'percentage'     => 'percentage',
        'location'       => 'location',
        'fulldayevent'   => 'fulldayevent',
        'note_private'   => 'note',
        'userownerid'    => 'fk_user_action',
        'socid'          => 'socid',
        'fk_soc'         => 'fk_soc',
        'contact_id'     => 'fk_contact',
        'fk_element'     => 'fk_element',
        'elementtype'    => 'elementtype',
        'priority'       => 'priority',
        'fk_project'     => 'fk_project',
        'status'         => 'status',
    ];

    /**
     * Fields that can be modified via API
     * @var array
     */
    /**
     * Fields that can be modified via API.
     *
     * Entries are the DOLISIDE keys of $listOfPublishedFields. The
     * controller translates the legacy API write key `fk_user_assigned`
     * into the appside key `fk_user_action` (mapped to PHP property
     * `userownerid`) BEFORE calling importMappedData(). Other appside-vs
     * -doliside renames (`note` -> `note_private`,
     * `fk_contact` -> `contact_id`) are handled natively by the mapper
     * since writableFields lists the doliside keys here.
     *
     * @var array
     */
    protected $writableFields = [
        'label',
        'type_code',
        'datep',
        'datef',
        'percentage',
        'location',
        'fulldayevent',
        'note_private',
        'userownerid',
        'socid',
        'contact_id',
        'fk_element',
        'elementtype',
        'priority',
        'fk_project',
        'status',
    ];

    /**
     * Constructor
     *
     * Loads extrafields configuration from admin settings.
     */
    public function __construct()
    {
        global $db;
        $this->db = $db;

        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_AGENDA_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        // Load read-write extrafields from configuration
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_AGENDA_EXTRAFIELDS_RW');
        if (!empty($extRW)) {
            foreach (explode(',', $extRW) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                    $this->writableFields[] = $key;
                }
            }
        }

        // Initialize the mapping (required by dmBase)
        $this->boot();
    }
}
