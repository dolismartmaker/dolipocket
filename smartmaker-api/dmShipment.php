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

dol_include_once('/expedition/class/expedition.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for Expedition (customer shipment / expedition client).
 *
 * Maps the Expedition header + its grouped shipment lines (ExpeditionLigne) to
 * API fields. Unlike the sales documents, the line table (expeditiondet) joins
 * the origin order line (commandedet) to expose product / pricing info, so the
 * published line fields mirror the properties Expedition::fetch_lines() fills.
 *
 * IMPORTANT: the controller MUST call $obj->fetch() (which itself calls
 * fetch_lines()) before exportMappedData(), so $obj->total_ht and the grouped
 * $obj->lines are populated.
 *
 * Note on the catalog: Expedition::$fields is declared empty in Dolibarr, so
 * dmCatalogTrait::getColumnCatalog() derives types from the descriptor
 * heuristics and reports defaultVisible=false for every column. The frontend
 * listConfig therefore drives default visibility through columnsOverrides.
 */
class dmShipment extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'Expedition';

    /**
     * Dolibarr line class, required by dmTrait::_objectDesc() and
     * dmCatalogTrait::getLinesCatalog() to expose the lines metadata.
     * @var string
     */
    protected $parentClassNameForLines = 'ExpeditionLigne';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'expedition';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()
     * when fetching extrafields metadata for the catalog).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'expedition';

    /**
     * Mapping for the shipment header.
     *
     * The LEFT keys are the PHP property names filled by Expedition::fetch()
     * (NOT the SQL column names): exportMappedData() reads $obj->{doliside}.
     * Examples: fetch() sets $this->statut (= fk_statut), $this->date_delivery,
     * $this->shipping_method_id (= fk_shipping_method), $this->trueWeight
     * (= weight column), $this->total_ht (computed in fetch_lines()).
     *
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'                => 'id',
        'ref'                  => 'ref',
        'ref_customer'         => 'ref_customer',
        'socid'                => 'socid',
        'fk_soc'               => 'fk_soc',
        'fk_project'           => 'fk_project',
        'fk_user_author'       => 'fk_user_author',
        'origin'               => 'origin',
        'origin_id'            => 'origin_id',
        'date_creation'        => 'date_creation',
        'date_valid'           => 'date_valid',
        'date_expedition'      => 'date_expedition',
        'date_delivery'        => 'date_delivery',
        'statut'               => 'statut',
        'billed'               => 'billed',
        'tracking_number'      => 'tracking_number',
        'tracking_url'         => 'tracking_url',
        'shipping_method_id'   => 'shipping_method_id',
        'shipping_method'      => 'shipping_method',
        'fk_delivery_address'  => 'fk_delivery_address',
        'trueWeight'           => 'weight',
        'weight_units'         => 'weight_units',
        'total_ht'             => 'total_ht',
        'total_ttc'            => 'total_ttc',
        'total_tva'            => 'total_tva',
        'note_public'          => 'note_public',
        'note_private'         => 'note_private',
        'model_pdf'            => 'model_pdf',
    ];

    /**
     * Mapping for shipment lines (ExpeditionLigne).
     *
     * The LEFT keys are the properties Expedition::fetch_lines() fills on each
     * grouped ExpeditionLigne. Notably qty_shipped is the real shipped quantity
     * while qty_asked is the ordered quantity; entrepot_id is the warehouse.
     *
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'          => 'id',
        'fk_origin_line' => 'fk_origin_line',
        'fk_expedition'  => 'fk_expedition',
        'fk_product'     => 'fk_product',
        'product_ref'    => 'product_ref',
        'product_label'  => 'product_label',
        'product_type'   => 'product_type',
        'label'          => 'label',
        'description'    => 'description',
        'qty_asked'      => 'qty_asked',
        'qty_shipped'    => 'qty_shipped',
        'qty'            => 'qty',
        'entrepot_id'    => 'entrepot_id',
        'rang'           => 'rang',
        'subprice'       => 'subprice',
        'tva_tx'         => 'tva_tx',
        'remise_percent' => 'remise_percent',
        'total_ht'       => 'total_ht',
        'total_tva'      => 'total_tva',
        'total_ttc'      => 'total_ttc',
        'weight'         => 'weight',
        'weight_units'   => 'weight_units',
        'fk_unit'        => 'fk_unit',
    ];

    /**
     * Fields that can be modified via API (header).
     * @var array
     */
    protected $writableFields = [
        'ref_customer',
        'tracking_number',
        'shipping_method_id',
        'date_delivery',
        'note_public',
        'note_private',
    ];

    /**
     * Restrict the global search to the shipment's own string columns.
     *
     * Expedition::$fields is empty, so the generic dmCatalogTrait::getSearchFields()
     * (which requires a $fields entry per column) would return an empty list and
     * the search box would silently match nothing. We override it with the SQL
     * column names that exist on llx_expedition. The PaginatedListTrait prepends
     * the table alias (e.g. "e.") before injecting them into the LIKE clause.
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['ref', 'ref_customer', 'tracking_number'];
    }

    /**
     * Constructor.
     *
     * Loads optional read-only / read-write extrafields from configuration,
     * mirroring the other Dolipocket mappers, then boots the mapping.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SHIPMENT_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_SHIPMENT_EXTRAFIELDS_RW');
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
