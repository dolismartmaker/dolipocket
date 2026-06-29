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
 * DolibarrMapping class for Societe (thirdparty) objects
 *
 * Maps Dolibarr Societe fields to API fields and handles extrafields
 * configuration from admin settings.
 */
class dmThirdParty extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'Societe';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'societe';

    /**
     * Mapping: Dolibarr field name => API field name
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'             => 'id',
        // Dolibarr's Societe class declares the column as `nom` in $fields and
        // in SQL (llx_societe.nom), but exposes a synonym property $name that
        // is kept in sync after fetch(). We use `nom` as the doliside key so
        // the catalog-driven SQL filter/sort produces valid `s.nom` clauses.
        // exportMappedData() reads $obj->nom which equals $obj->name after fetch.
        'nom'               => 'name',
        'name_alias'        => 'name_alias',
        'code_client'       => 'code_client',
        'code_fournisseur'  => 'code_fournisseur',
        'client'            => 'client',
        'fournisseur'       => 'fournisseur',
        'address'           => 'address',
        'zip'               => 'zip',
        'town'              => 'town',
        'country_code'      => 'country_code',
        'phone'             => 'phone',
        'email'             => 'email',
        'url'               => 'url',
        'siren'             => 'siren',
        'siret'             => 'siret',
        'ape'               => 'ape',
        'idprof4'           => 'idprof4',
        'tva_intra'         => 'tva_intra',
        'tva_assuj'         => 'tva_assuj',
        'code_compta'       => 'code_compta',
        'code_compta_fournisseur' => 'code_compta_fournisseur',
        'note_public'       => 'note_public',
        'note_private'      => 'note_private',
        'status'            => 'status',
        'datec'             => 'datec',
        'tms'               => 'tms',
    ];

    /**
     * Fields that can be modified via API.
     *
     * Entries are the DOLISIDE keys of $listOfPublishedFields (matching how
     * importMappedData() walks the reverseMap). The Dolibarr SQL column for
     * the company name is `nom` even though Societe exposes a synonym
     * property $name -- so the doliside key here is 'nom'. The controller
     * re-routes \$sanitized->nom onto \$tp->name in the post-import loop
     * because Societe::update() reads $this->name (then mirrors it onto
     * $this->nom for backward compatibility).
     *
     * @var array
     */
    protected $writableFields = [
        'nom',
        'name_alias',
        'code_client',
        'code_fournisseur',
        'client',
        'fournisseur',
        'address',
        'zip',
        'town',
        'country_code',
        'phone',
        'email',
        'url',
        'siren',
        'siret',
        'ape',
        'idprof4',
        'tva_intra',
        'tva_assuj',
        'code_compta',
        'code_compta_fournisseur',
        'note_public',
        'note_private',
        'status',
    ];

    /**
     * Constructor
     *
     * Loads extrafields configuration from admin settings.
     */
    public function __construct()
    {
        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_THIRDPARTY_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_THIRDPARTY_EXTRAFIELDS_RW');
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
