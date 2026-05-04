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

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;

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

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'ActionComm';

    /**
     * Parent class name used by the mapping helpers
     * @var string
     */
    protected $parentClassName = 'ActionComm';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'actioncomm';

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
        'status'         => 'status',
    ];

    /**
     * Fields that can be modified via API
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
        'note',
        'fk_user_action',
        'fk_user_assigned',
        'socid',
        'fk_contact',
        'fk_element',
        'elementtype',
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
