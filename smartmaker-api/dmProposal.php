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
 * DolibarrMapping for Propal (proposal / devis client)
 *
 * Maps Dolibarr Propal header and PropaleLigne rows to API fields.
 * The controller MUST call $obj->fetch_lines() before exportMappedData()
 * for the lines block to be populated.
 */
class dmProposal extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot())
     * @var string
     */
    protected $dolibarrClassName = 'Propal';

    /**
     * Opt-in FK -> label companion fields resolved by dmTrait. Exposes the
     * thirdparty name (+ email) alongside the raw socid, without nesting the
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
     * Dolibarr line class, required by dmTrait::_objectDesc() to expose lines metadata.
     * @var string
     */
    protected $parentClassNameForLines = 'PropaleLigne';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'propal';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()
     * line 161 when fetching extrafields metadata for the catalog).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'propal';

    /**
     * Force a sellist descriptor on the bare-integer reference fields so the
     * AutoForm front renders them as <Select> populated from the matching
     * Dolibarr c_* table instead of an empty numeric input. Cf .claude/CLAUDE.md
     * "Lot 9 - sellist resolver". Without this override Propal::$fields
     * declares fk_cond_reglement / fk_mode_reglement / fk_account as plain
     * 'integer' which the smartauth resolver cannot translate into options.
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
     * Mapping for the proposal header.
     * Validated against Propal::$fields (cf comm/propal/class/propal.class.php).
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'              => 'id',
        'ref'                => 'ref',
        'ref_client'         => 'ref_client',
        'socid'              => 'socid',
        'fk_soc'             => 'fk_soc',
        'fk_projet'          => 'fk_projet',
        'fk_user_author'     => 'fk_user_author',
        'fk_user_valid'      => 'fk_user_valid',
        'fk_user_cloture'    => 'fk_user_cloture',
        'datec'              => 'datec',
        'datep'              => 'datep',
        'datev'              => 'datev',
        'date_valid'         => 'date_valid',
        'date_cloture'       => 'date_cloture',
        'fin_validite'       => 'fin_validite',
        'total_ht'           => 'total_ht',
        'total_ttc'          => 'total_ttc',
        'total_tva'          => 'total_tva',
        'statut'             => 'statut',
        'note_public'        => 'note_public',
        'note_private'       => 'note_private',
        'fk_cond_reglement'  => 'fk_cond_reglement',
        'fk_mode_reglement'  => 'fk_mode_reglement',
        'fk_account'         => 'fk_account',
        'fk_currency'        => 'fk_currency',
        'model_pdf'          => 'model_pdf',
        'last_main_doc'      => 'last_main_doc',
    ];

    /**
     * Mapping for proposal lines (PropaleLigne).
     * Validated against PropaleLigne properties (no $fields array on the
     * line class -- properties are listed near line 4051 of propal.class.php).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_propal'      => 'fk_propal',
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
        'datep',
        'datev',
        'fin_validite',
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
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PROPAL_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PROPAL_EXTRAFIELDS_RW');
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
