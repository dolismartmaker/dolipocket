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
 * DolibarrMapping for Commande (sales order / commande client)
 *
 * Maps Dolibarr Commande header and OrderLine rows to API fields.
 * The controller MUST call $obj->fetch_lines() before exportMappedData()
 * for the lines block to be populated.
 */
class dmOrder extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot())
     * @var string
     */
    protected $dolibarrClassName = 'Commande';

    /**
     * Dolibarr class name
     * @var string
     */
    protected $parentClassName = 'Commande';

    /**
     * Dolibarr line class, required by dmTrait::_objectDesc() to expose lines metadata.
     * @var string
     */
    protected $parentClassNameForLines = 'OrderLine';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype)
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'commande';

    /**
     * Mapping for the order header.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'              => 'id',
        'ref'                => 'ref',
        'ref_client'         => 'ref_client',
        'socid'              => 'socid',
        'fk_soc'             => 'fk_soc',
        'fk_user_author'     => 'fk_user_author',
        'date_commande'      => 'date_commande',
        'date_livraison'     => 'date_livraison',
        'total_ht'           => 'total_ht',
        'total_ttc'          => 'total_ttc',
        'total_tva'          => 'total_tva',
        'statut'             => 'statut',
        'note_public'        => 'note_public',
        'note_private'       => 'note_private',
        'fk_cond_reglement'  => 'fk_cond_reglement',
        'fk_mode_reglement'  => 'fk_mode_reglement',
    ];

    /**
     * Mapping for order lines (OrderLine).
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_commande'    => 'fk_commande',
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
        'date_commande',
        'date_livraison',
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
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_ORDER_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_ORDER_EXTRAFIELDS_RW');
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
