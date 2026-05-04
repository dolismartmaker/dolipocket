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
use Dolipocket\Api\Trait\dmCatalogTrait;

dol_include_once('/dolipocket/smartmaker-api/Trait/dmCatalogTrait.php');
require_once DOL_DOCUMENT_ROOT.'/product/class/product.class.php';

/**
 * Dolibarr Product/Service mapping for Dolipocket API.
 *
 * Maps the native Dolibarr Product class fields to API field names. Used by
 * ProductController to expose products and services through the PWA.
 */
class dmProduct extends dmBase
{
    use dmTrait;
    use dmCatalogTrait;

    /**
     * Dolibarr class name for instantiation by dmTrait::boot().
     * @var string
     */
    protected $dolibarrClassName = 'Product';

    /**
     * Dolibarr class name for the parent object.
     * @var string
     */
    protected $parentClassName = 'Product';

    /**
     * Element name used by extrafields (matches llx_extrafields.elementtype).
     * @var string
     */
    protected $parentElementToUseForExtraFields = 'product';

    /**
     * Mapping: Dolibarr field name => API field name.
     * @var array
     */
    protected $listOfPublishedFields = [
        'rowid'        => 'id',
        'ref'          => 'ref',
        'label'        => 'label',
        'description'  => 'description',
        'type'         => 'type',
        'price'        => 'price',
        'price_ttc'    => 'price_ttc',
        'tva_tx'       => 'tva_tx',
        'weight'       => 'weight',
        'length'       => 'length',
        'width'        => 'width',
        'height'       => 'height',
        'stock_reel'   => 'stock_reel',
        'status'       => 'status',
        'status_buy'   => 'status_buy',
        'barcode'      => 'barcode',
        'country_code' => 'country_code',
        'date_creation' => 'datec',
        'tms'          => 'tms',
    ];

    /**
     * Fields writable through the API.
     * @var array
     */
    protected $writableFields = [
        'ref',
        'label',
        'description',
        'type',
        'price',
        'price_ttc',
        'tva_tx',
        'weight',
        'length',
        'width',
        'height',
        'status',
        'status_buy',
        'barcode',
    ];

    /**
     * Constructor: load extrafields configuration and bootstrap the mapping.
     */
    public function __construct()
    {
        global $db;
        $this->db = $db;

        // Load read-only extrafields from configuration
        $extRO = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PRODUCT_EXTRAFIELDS_RO');
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
        $extRW = getDolGlobalString('DOLIPOCKET_SMARTMAKER_PRODUCT_EXTRAFIELDS_RW');
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
