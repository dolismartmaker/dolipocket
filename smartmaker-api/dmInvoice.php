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
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace Dolipocket\Api;

dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for Facture (customer invoice / facture client)
 *
 * Maps Dolibarr Facture header and FactureLigne rows to API fields.
 * The controller MUST call $obj->fetch_lines() before exportMappedData()
 * for the lines block to be populated.
 */
class dmInvoice extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot())
     * @var string
     */
    protected $dolibarrClassName = 'Facture';

    /**
     * Dolibarr line class, required by dmTrait::_objectDesc() to expose lines metadata.
     * @var string
     */
    protected $parentClassNameForLines = 'FactureLigne';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'facture';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()
     * line 161 when fetching extrafields metadata for the catalog).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'facture';

    /**
     * Force a sellist descriptor on bare-integer reference fields so the
     * AutoForm front renders <Select> populated from c_* tables. Cf the
     * matching block in dmProposal for the full rationale.
     *
     * @var array
     */
    protected $parentFieldsOverride = [
        'fk_cond_reglement' => array('type' => 'sellist:c_payment_term:libelle:rowid', 'label' => 'PaymentConditionsShort'),
        'fk_mode_reglement' => array('type' => 'sellist:c_paiement:libelle:id', 'label' => 'PaymentMode'),
        'fk_account'        => array('type' => 'sellist:bank_account:label:rowid', 'label' => 'BankAccount'),
        'fk_currency'       => array('type' => 'sellist:c_currencies:label:code_iso', 'label' => 'Currency'),
    ];

    /**
     * Mapping for the invoice header.
     * Validated against Facture::$fields (cf compta/facture/class/facture.class.php).
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'                => 'id',
        'ref'                  => 'ref',
        'ref_client'           => 'ref_client',
        'socid'                => 'socid',
        'fk_soc'               => 'fk_soc',
        'fk_projet'            => 'fk_projet',
        'fk_user_author'       => 'fk_user_author',
        'fk_user_valid'        => 'fk_user_valid',
        'fk_user_closing'      => 'fk_user_closing',
        'fk_user_modif'        => 'fk_user_modif',
        'type'                 => 'type',
        'datec'                => 'datec',
        'datef'                => 'datef',
        'date_valid'           => 'date_valid',
        'date_lim_reglement'   => 'date_lim_reglement',
        'date_closing'         => 'date_closing',
        'total_ht'             => 'total_ht',
        'total_ttc'            => 'total_ttc',
        'total_tva'            => 'total_tva',
        'paye'                 => 'paye',
        'statut'               => 'statut',
        'close_code'           => 'close_code',
        'close_note'           => 'close_note',
        'note_public'          => 'note_public',
        'note_private'         => 'note_private',
        'fk_cond_reglement'    => 'fk_cond_reglement',
        'fk_mode_reglement'    => 'fk_mode_reglement',
        'fk_account'           => 'fk_account',
        'fk_currency'          => 'fk_currency',
        'fk_facture_source'    => 'fk_facture_source',
        'model_pdf'            => 'model_pdf',
        'last_main_doc'        => 'last_main_doc',
    ];

    /**
     * Mapping for invoice lines (FactureLigne).
     * Validated against FactureLigne properties (no $fields on the line
     * class -- properties are listed near line 6058 of facture.class.php).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_facture'     => 'fk_facture',
        'fk_parent_line' => 'fk_parent_line',
        'fk_product'     => 'fk_product',
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
     * Fields that can be modified via API
     * @var array
     */
    protected $writableFields = [
        'ref_client',
        'datef',
        'date_lim_reglement',
        'note_public',
        'note_private',
        'fk_cond_reglement',
        'fk_mode_reglement',
    ];

    /**
     * Constructor
     *
     * Loads extrafields configuration from admin settings.
     */
    public function __construct()
    {
        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_INVOICE_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_INVOICE_EXTRAFIELDS_RW');
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
