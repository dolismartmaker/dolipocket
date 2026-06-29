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

dol_include_once('/reception/class/reception.class.php');
dol_include_once('/fourn/class/fournisseur.commande.dispatch.class.php');
dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;
use Dolipocket\Api\Trait\dmCatalogTrait;

/**
 * DolibarrMapping for Reception (supplier reception / reception fournisseur).
 *
 * Supplier-side analog of dmShipment: maps the Reception header + its lines
 * (CommandeFournisseurDispatch, stored in llx_commande_fournisseur_dispatch) to
 * API fields. Each line joins back the supplier order line
 * (commande_fournisseurdet) to expose product / pricing info, mirroring what
 * Reception::fetch_lines() fills.
 *
 * The controller MUST call $obj->fetch() (which itself calls fetch_lines())
 * before exportMappedData(), so totals and the $obj->lines are populated.
 *
 * Like Expedition, Reception::$fields is effectively empty, so the catalog
 * derives types heuristically and reports defaultVisible=false everywhere; the
 * frontend listConfig drives default visibility through columnsOverrides.
 */
class dmReception extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name (used by dmTrait::boot()).
     * @var string
     */
    protected $dolibarrClassName = 'Reception';

    /**
     * Dolibarr line class (the dispatch line), required by dmTrait and
     * dmCatalogTrait::getLinesCatalog() to expose the lines metadata.
     * @var string
     */
    protected $parentClassNameForLines = 'CommandeFournisseurDispatch';

    /**
     * Element name for extrafields (must match llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'reception';

    /**
     * Table-side element name (consumed by SmartAuth dmTrait::_objectDesc()).
     * @var string
     */
    protected $parentTableElementToUseForExtraFields = 'reception';

    /**
     * Mapping for the reception header.
     *
     * The LEFT keys are the PHP property names filled by Reception::fetch()
     * (NOT the SQL column names): exportMappedData() reads $obj->{doliside}.
     * Examples: fetch() sets $this->statut (= fk_statut), $this->date_reception,
     * $this->shipping_method_id (= fk_shipping_method), $this->trueWeight
     * (= weight column), $this->total_ht (computed in fetch_lines()).
     *
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'                => 'id',
        'ref'                  => 'ref',
        'ref_supplier'         => 'ref_supplier',
        'socid'                => 'socid',
        'fk_soc'               => 'fk_soc',
        'fk_project'           => 'fk_project',
        'user_author_id'       => 'fk_user_author',
        'origin'               => 'origin',
        'origin_id'            => 'origin_id',
        'date_creation'        => 'date_creation',
        'date_reception'       => 'date_reception',
        'date_delivery'        => 'date_delivery',
        'statut'               => 'statut',
        'billed'               => 'billed',
        'tracking_number'      => 'tracking_number',
        'tracking_url'         => 'tracking_url',
        'shipping_method_id'   => 'shipping_method_id',
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
     * Mapping for reception lines (CommandeFournisseurDispatch).
     *
     * The LEFT keys are the properties Reception::fetch_lines() fills on each
     * dispatch line. qty is the received quantity, qty_asked is the ordered
     * quantity, fk_entrepot is the warehouse the goods landed in.
     *
     * @var array
     */
    protected $listOfPublishedFieldsForLines = [
        'rowid'              => 'id',
        'fk_commandefourndet' => 'fk_commandefourndet',
        'fk_commande'        => 'fk_commande',
        'fk_reception'       => 'fk_reception',
        'fk_product'         => 'fk_product',
        'fk_entrepot'        => 'entrepot_id',
        'label'              => 'label',
        'description'        => 'description',
        'ref_supplier'       => 'ref_supplier',
        'qty_asked'          => 'qty_asked',
        'qty'                => 'qty',
        'subprice'           => 'subprice',
        'tva_tx'             => 'tva_tx',
        'remise_percent'     => 'remise_percent',
        'total_ht'           => 'total_ht',
        'total_tva'          => 'total_tva',
        'total_ttc'          => 'total_ttc',
        'batch'              => 'batch',
        'eatby'              => 'eatby',
        'sellby'             => 'sellby',
        'cost_price'         => 'cost_price',
        'comment'            => 'comment',
        'status'             => 'status',
    ];

    /**
     * Fields that can be modified via API (header).
     * @var array
     */
    protected $writableFields = [
        'ref_supplier',
        'tracking_number',
        'shipping_method_id',
        'date_delivery',
        'note_public',
        'note_private',
    ];

    /**
     * Restrict the global search to the reception's own string columns.
     *
     * Reception::$fields is empty, so the generic dmCatalogTrait::getSearchFields()
     * would return an empty list and the search box would match nothing. We
     * expose the llx_reception string columns; PaginatedListTrait prepends the
     * table alias before injecting them into the LIKE clause.
     *
     * @return array<int,string>
     */
    public function getSearchFields()
    {
        return ['ref', 'ref_supplier', 'tracking_number'];
    }

    /**
     * Constructor.
     *
     * Loads optional read-only / read-write extrafields from configuration,
     * mirroring the other Dolipocket mappers, then boots the mapping.
     */
    public function __construct()
    {
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_RECEPTION_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_RECEPTION_EXTRAFIELDS_RW');
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
