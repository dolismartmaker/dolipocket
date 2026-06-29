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

dol_include_once('/supplier_proposal/class/supplier_proposal.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for SupplierProposal (price request / demande de prix
 * fournisseur). Supplier-side counterpart of dmProposal (customer devis).
 *
 * Maps the SupplierProposal header + its SupplierProposalLine rows to API
 * fields. The controller MUST call $obj->fetch() (which loads the lines)
 * before exportMappedData().
 *
 * The LEFT keys are the PHP property names filled by SupplierProposal::fetch()
 * (NOT the SQL column names): exportMappedData() reads $obj->{doliside}.
 * Examples: fetch() sets $this->statut (= fk_statut), $this->cond_reglement_id
 * (= fk_cond_reglement), $this->date_creation (= datec), $this->date_validation
 * (= datev). The controller drives sort/filter via an explicit SQL-column map
 * (cf SupplierProposalController) rather than the catalog, to avoid the
 * doliside-vs-column mismatch.
 */
class dmSupplierProposal extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'SupplierProposal';

    /**
     * Dolibarr line class, required by dmTrait and dmCatalogTrait::getLinesCatalog().
     * @var string
     */
    protected $parentClassNameForLines = 'SupplierProposalLine';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'supplier_proposal';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'supplier_proposal';

    /**
     * Mapping for the supplier proposal header.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'             => 'id',
        'ref'               => 'ref',
        'socid'             => 'socid',
        'fk_soc'            => 'fk_soc',
        'fk_project'        => 'fk_project',
        'user_author_id'    => 'fk_user_author',
        'date_creation'     => 'date_creation',
        'date_validation'   => 'date_validation',
        'delivery_date'     => 'delivery_date',
        'statut'            => 'statut',
        'total_ht'          => 'total_ht',
        'total_ttc'         => 'total_ttc',
        'total_tva'         => 'total_tva',
        'remise_percent'    => 'remise_percent',
        'remise_absolue'    => 'remise_absolue',
        'note_public'       => 'note_public',
        'note_private'      => 'note_private',
        'cond_reglement_id' => 'fk_cond_reglement',
        'mode_reglement_id' => 'fk_mode_reglement',
        'fk_account'        => 'fk_account',
        'shipping_method_id' => 'shipping_method_id',
        'model_pdf'         => 'model_pdf',
        'last_main_doc'     => 'last_main_doc',
    ];

    /**
     * Mapping for supplier proposal lines (SupplierProposalLine).
     *
     * Note: the line description is held on the $desc property (fetch sets
     * $line->desc = description column), so we publish 'desc' => 'description'.
     * ref_fourn is the supplier reference declared on the line.
     *
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'                 => 'id',
        'fk_supplier_proposal'  => 'fk_supplier_proposal',
        'fk_parent_line'        => 'fk_parent_line',
        'fk_product'            => 'fk_product',
        'product_ref'           => 'product_ref',
        'product_label'         => 'product_label',
        'product_type'          => 'product_type',
        'label'                 => 'label',
        'desc'                  => 'description',
        'ref_fourn'             => 'ref_supplier',
        'qty'                   => 'qty',
        'subprice'              => 'subprice',
        'tva_tx'                => 'tva_tx',
        'remise_percent'        => 'remise_percent',
        'total_ht'              => 'total_ht',
        'total_tva'             => 'total_tva',
        'total_ttc'             => 'total_ttc',
        'info_bits'             => 'info_bits',
        'special_code'          => 'special_code',
        'rang'                  => 'rang',
        'fk_unit'               => 'fk_unit',
    ];

    /**
     * Fields that can be modified via API (header).
     * @var array
     */
    protected $writableFields = [
        'note_public',
        'note_private',
        'cond_reglement_id',
        'mode_reglement_id',
        'delivery_date',
    ];

    /**
     * Restrict the global search to the supplier proposal's own string columns.
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['ref'];
    }

    /**
     * Constructor.
     *
     * Loads optional read-only / read-write extrafields from configuration,
     * mirroring the other Dolipocket mappers, then boots the mapping.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERPROPOSAL_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SUPPLIERPROPOSAL_EXTRAFIELDS_RW');
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
