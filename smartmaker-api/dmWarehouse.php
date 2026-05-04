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
use Dolipocket\Api\Trait\dmCatalogTrait;

dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');
require_once DOL_DOCUMENT_ROOT.'/product/stock/class/entrepot.class.php';

/**
 * Dolibarr Entrepot (Warehouse) mapping for Dolipocket API.
 *
 * Note: The native Entrepot class fetch SQL aliases the BDD column "ref" to
 * the PHP property "label". We expose both label and ref because some callers
 * may want the unique business reference while others want the display label.
 */
class dmWarehouse extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name for instantiation by dmTrait::boot().
     * @var string
     */
    protected $dolibarrClassName = 'Entrepot';

    /**
     * Dolibarr class name for the parent object.
     * @var string
     */
    protected $parentClassName = 'Entrepot';

    /**
     * Element name used by extrafields (matches llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'stock';

    /**
     * Table element used by Dolibarr extrafields.
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'entrepot';

    /**
     * Mapping: Dolibarr field name => API field name.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'        => 'id',
        'ref'          => 'ref',
        'label'        => 'label',
        'description'  => 'description',
        'lieu'         => 'lieu',
        'address'      => 'address',
        'zip'          => 'zip',
        'town'         => 'town',
        'country_code' => 'country_code',
        'phone'        => 'phone',
        'fax'          => 'fax',
        'statut'       => 'statut',
        'fk_parent'    => 'fk_parent',
    ];

    /**
     * Fields writable through the API.
     * @var array
     */
    protected $writableFields = [
        'label',
        'description',
        'lieu',
        'address',
        'zip',
        'town',
        'phone',
        'fax',
        'statut',
        'fk_parent',
    ];

    /**
     * Constructor: load extrafields configuration and bootstrap the mapping.
     */
    public function __construct()
    {
        global $db;
        $this->db = $db;

        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_WAREHOUSE_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_WAREHOUSE_EXTRAFIELDS_RW');
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

        $this->boot();
    }
}
