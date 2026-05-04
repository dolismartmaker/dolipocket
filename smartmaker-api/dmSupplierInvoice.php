<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Api;

dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for FactureFournisseur (supplier invoices).
 *
 * Maps Dolibarr fields to API field names. Header fields and line fields
 * are exposed using their raw Dolibarr names so that PWA payloads round-trip
 * unchanged through the controller.
 */
class dmSupplierInvoice extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'FactureFournisseur';

    /**
     * Dolibarr class name
     * @var string
     */
    protected $parentClassName = 'FactureFournisseur';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'facture_fourn';

    /**
     * Mapping: Dolibarr field name => API field name (header)
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'              => 'id',
        'ref'                => 'ref',
        'ref_supplier'       => 'ref_supplier',
        'socid'              => 'socid',
        'fk_soc'             => 'fk_soc',
        'type'               => 'type',
        'datef'              => 'datef',
        'date_lim_reglement' => 'date_lim_reglement',
        'total_ht'           => 'total_ht',
        'total_ttc'          => 'total_ttc',
        'total_tva'          => 'total_tva',
        'paye'               => 'paye',
        'statut'             => 'statut',
        'note_public'        => 'note_public',
        'note_private'       => 'note_private',
        'fk_cond_reglement'  => 'fk_cond_reglement',
        'fk_mode_reglement'  => 'fk_mode_reglement',
        'libelle'            => 'libelle',
    ];

    /**
     * Class name used for line objects (SupplierInvoiceLine)
     * @var string
     */
    protected $parentClassNameForLines = 'SupplierInvoiceLine';

    /**
     * Label for lines title
     * @var string
     */
    protected $parentLabelForLines = 'SupplierInvoiceLines';

    /**
     * Mapping: Dolibarr field name => API field name (lines)
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'            => 'id',
        'fk_facture_fourn' => 'fk_facture_fourn',
        'fk_product'       => 'fk_product',
        'ref'              => 'ref',
        'label'            => 'label',
        'description'      => 'description',
        'qty'              => 'qty',
        'tva_tx'           => 'tva_tx',
        'subprice'         => 'subprice',
        'remise_percent'   => 'remise_percent',
        'total_ht'         => 'total_ht',
        'total_ttc'        => 'total_ttc',
        'rang'             => 'rang',
        'product_type'     => 'product_type',
    ];

    /**
     * Fields that can be modified via API (header)
     * @var array
     */
    protected $writableFields = [
        'ref_supplier',
        'socid',
        'fk_soc',
        'type',
        'datef',
        'date_lim_reglement',
        'note_public',
        'note_private',
        'fk_cond_reglement',
        'fk_mode_reglement',
        'libelle',
    ];

    /**
     * Constructor: load extrafields configuration and boot the mapping.
     */
    public function __construct()
    {
        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERINVOICE_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERINVOICE_EXTRAFIELDS_RW');
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
