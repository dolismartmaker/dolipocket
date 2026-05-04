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
     * Dolibarr class name
     * @var string
     */
    protected $parentClassName = 'Facture';

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
     * Mapping for the invoice header.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'                => 'id',
        'ref'                  => 'ref',
        'ref_client'           => 'ref_client',
        'socid'                => 'socid',
        'fk_soc'               => 'fk_soc',
        'type'                 => 'type',
        'datef'                => 'datef',
        'date_lim_reglement'   => 'date_lim_reglement',
        'total_ht'             => 'total_ht',
        'total_ttc'            => 'total_ttc',
        'total_tva'            => 'total_tva',
        'paye'                 => 'paye',
        'statut'               => 'statut',
        'note_public'          => 'note_public',
        'note_private'         => 'note_private',
        'fk_cond_reglement'    => 'fk_cond_reglement',
        'fk_mode_reglement'    => 'fk_mode_reglement',
    ];

    /**
     * Mapping for invoice lines (FactureLigne).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_facture'     => 'fk_facture',
        'fk_product'     => 'fk_product',
        'label'          => 'label',
        'description'    => 'description',
        'qty'            => 'qty',
        'tva_tx'         => 'tva_tx',
        'subprice'       => 'subprice',
        'remise_percent' => 'remise_percent',
        'total_ht'       => 'total_ht',
        'total_ttc'      => 'total_ttc',
        'rang'           => 'rang',
        'product_type'   => 'product_type',
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
