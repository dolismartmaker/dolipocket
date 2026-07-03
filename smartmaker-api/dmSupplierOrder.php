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
 * DolibarrMapping for CommandeFournisseur (supplier orders).
 *
 * Maps Dolibarr fields to API field names. Header fields and line fields
 * are exposed using their raw Dolibarr names so that PWA payloads round-trip
 * unchanged through the controller.
 */
class dmSupplierOrder extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot() to instantiate the object)
     * @var string
     */
    protected $dolibarrClassName = 'CommandeFournisseur';

    /**
     * Opt-in FK -> label companion fields resolved by dmTrait. Exposes the
     * supplier name (+ email) alongside the raw socid, without nesting the
     * whole Societe -- so lists and detail show a human name automatically.
     * @var array
     */
    protected $listOfForeignKeyLabels = [
        'fk_soc' => [
            'class'  => 'Societe',
            'path'   => 'societe/class/societe.class.php',
            'labels' => ['socname' => 'name', 'socEmail' => 'email'],
        ],
    ];

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'commande_fournisseur';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()
     * line 161 when fetching extrafields metadata for the catalog).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'commande_fournisseur';

    /**
     * Force a sellist descriptor on bare-integer reference fields so the
     * AutoForm front renders <Select> populated from c_* tables. Cf the
     * matching block in dmProposal for the full rationale. fk_currency is
     * declared as varchar(3) on the supplier order header so we don't need
     * to override it here (the smartauth resolver already kicks in).
     *
     * @var array
     */
    protected $parentFieldsOverride = [
        'fk_cond_reglement' => array('type' => 'sellist:c_payment_term:libelle:rowid', 'label' => 'PaymentConditionsShort'),
        'fk_mode_reglement' => array('type' => 'sellist:c_paiement:libelle:id', 'label' => 'PaymentMode'),
        'fk_account'        => array('type' => 'sellist:bank_account:label:rowid', 'label' => 'BankAccount'),
    ];

    /**
     * Mapping: Dolibarr field name => API field name (header)
     * Validated against CommandeFournisseur::$fields (cf
     * fourn/class/fournisseur.commande.class.php).
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'              => 'id',
        'ref'                => 'ref',
        'ref_supplier'       => 'ref_supplier',
        'socid'              => 'socid',
        'fk_soc'             => 'fk_soc',
        'fk_projet'          => 'fk_projet',
        'fk_user_author'     => 'fk_user_author',
        'fk_user_valid'      => 'fk_user_valid',
        'fk_user_approve'    => 'fk_user_approve',
        'fk_user_approve2'   => 'fk_user_approve2',
        'date_creation'      => 'date_creation',
        'date_commande'      => 'date_commande',
        'date_valid'         => 'date_valid',
        'date_approve'       => 'date_approve',
        'date_approve2'      => 'date_approve2',
        'date_livraison'     => 'date_livraison',
        'total_ht'           => 'total_ht',
        'total_ttc'          => 'total_ttc',
        'total_tva'          => 'total_tva',
        'statut'             => 'statut',
        'billed'             => 'billed',
        'note_public'        => 'note_public',
        'note_private'       => 'note_private',
        'fk_cond_reglement'  => 'fk_cond_reglement',
        'fk_mode_reglement'  => 'fk_mode_reglement',
        'fk_account'         => 'fk_account',
        'fk_input_method'    => 'fk_input_method',
        'model_pdf'          => 'model_pdf',
        'last_main_doc'      => 'last_main_doc',
    ];

    /**
     * Class name used for line objects (CommandeFournisseurLigne)
     * @var string
     */
    protected $parentClassNameForLines = 'CommandeFournisseurLigne';

    /**
     * Label for lines title
     * @var string
     */
    protected $parentLabelForLines = 'SupplierOrderLines';

    /**
     * Mapping: Dolibarr field name => API field name (lines)
     * Validated against CommandeFournisseurLigne properties (no $fields on
     * the line class -- properties listed near line 3719 of
     * fournisseur.commande.class.php).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_commande'    => 'fk_commande',
        'fk_parent_line' => 'fk_parent_line',
        'fk_product'     => 'fk_product',
        'ref'            => 'ref',
        'product_ref'    => 'product_ref',
        'product_label'  => 'product_label',
        'product_type'   => 'product_type',
        'label'          => 'label',
        'description'    => 'description',
        'qty'            => 'qty',
        'subprice'       => 'subprice',
        'tva_tx'         => 'tva_tx',
        'localtax1_tx'   => 'localtax1_tx',
        'localtax2_tx'   => 'localtax2_tx',
        'remise_percent' => 'remise_percent',
        'total_ht'       => 'total_ht',
        'total_tva'      => 'total_tva',
        'total_ttc'      => 'total_ttc',
        'date_start'     => 'date_start',
        'date_end'       => 'date_end',
        'info_bits'      => 'info_bits',
        'special_code'   => 'special_code',
        'rang'           => 'rang',
        'fk_unit'        => 'fk_unit',
    ];

    /**
     * Fields that can be modified via API (header)
     * @var array
     */
    protected $writableFields = [
        'ref_supplier',
        'socid',
        'fk_soc',
        'date_commande',
        'date_livraison',
        'note_public',
        'note_private',
        'fk_cond_reglement',
        'fk_mode_reglement',
    ];

    /**
     * Constructor: load extrafields configuration and boot the mapping.
     */
    public function __construct()
    {
        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERORDER_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERORDER_EXTRAFIELDS_RW');
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
