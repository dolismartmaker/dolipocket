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

use SmartAuth\DolibarrMapping\dmBase;
use SmartAuth\DolibarrMapping\dmTrait;

require_once DOL_DOCUMENT_ROOT.'/product/stock/class/mouvementstock.class.php';

/**
 * Dolibarr MouvementStock (stock movement) mapping for Dolipocket API.
 *
 * Note about field naming: the BDD column is "type_mouvement" (table
 * llx_stock_mouvement) but the PHP class exposes it as $type. The "value"
 * BDD column is exposed as $qty in PHP. We map the PHP-side names because
 * exportMappedData() reads object properties.
 */
class dmStockMovement extends dmBase
{
    use dmTrait;

    /**
     * Dolibarr class name for instantiation by dmTrait::boot().
     * @var string
     */
    protected $dolibarrClassName = 'MouvementStock';

    /**
     * Dolibarr class name for the parent object.
     * @var string
     */
    protected $parentClassName = 'MouvementStock';

    /**
     * Element name used by extrafields (matches llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'stock_mouvement';

    /**
     * Mapping: Dolibarr field name => API field name.
     *
     * "value" maps to qty in PHP, "type_mouvement" maps to type in PHP.
     * The keys here reflect the canonical BDD names declared in $fields and
     * are translated into PHP properties by the controller before calling
     * exportMappedData().
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'           => 'id',
        'fk_product'      => 'fk_product',
        'fk_entrepot'     => 'fk_entrepot',
        'value'           => 'value',
        'price'           => 'price',
        'type_mouvement'  => 'type_mouvement',
        'label'           => 'label',
        'datem'           => 'datem',
        'fk_user_author'  => 'fk_user_author',
        'inventorycode'   => 'inventorycode',
    ];

    /**
     * Fields writable through the API.
     *
     * Stock movements are immutable from the user's perspective; the only
     * way to create one is via Product::correct_stock(). We never expose an
     * update endpoint.
     * @var array
     */
    protected $writableFields = [];

    /**
     * Constructor: load extrafields configuration and bootstrap the mapping.
     */
    public function __construct()
    {
        global $db;
        $this->db = $db;

        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_STOCKMOVEMENT_EXTRAFIELDS_RO');
        if (!empty($extRO)) {
            foreach (explode(',', $extRO) as $field) {
                $field = trim($field);
                if (!empty($field)) {
                    $key = 'options_' . $field;
                    $this->listOfPublishedFields[$key] = $key;
                }
            }
        }

        $this->boot();
    }
}
