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
 * DolibarrMapping class for Contact objects
 *
 * Maps Dolibarr Contact fields to API fields and handles extrafields
 * configuration from admin settings.
 */
class dmContact extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'Contact';

    /**
     * Dolibarr class name
     * @var string
     */
    protected $parentClassName = 'Contact';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'socpeople';

    /**
     * Mapping: Dolibarr field name => API field name
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'         => 'id',
        'lastname'      => 'lastname',
        'firstname'     => 'firstname',
        'civility_code' => 'civility',
        'fk_soc'        => 'fk_soc',
        'address'       => 'address',
        'zip'           => 'zip',
        'town'          => 'town',
        'country_code'  => 'country_code',
        'phone_pro'     => 'phone_pro',
        'phone_mobile'  => 'phone_mobile',
        'fax'           => 'fax',
        'email'         => 'email',
        'statut'        => 'statut',
        'poste'         => 'poste',
        'note_public'   => 'note_public',
        'note_private'  => 'note_private',
    ];

    /**
     * Fields that can be modified via API
     * @var array
     */
    protected $writableFields = [
        'lastname',
        'firstname',
        'civility',
        'fk_soc',
        'address',
        'zip',
        'town',
        'country_code',
        'phone_pro',
        'phone_mobile',
        'fax',
        'email',
        'statut',
        'poste',
        'note_public',
        'note_private',
    ];

    /**
     * Constructor
     *
     * Loads extrafields configuration from admin settings.
     */
    public function __construct()
    {
        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_CONTACT_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_CONTACT_EXTRAFIELDS_RW');
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

        // Initialize the mapping
        $this->boot();
    }
}
