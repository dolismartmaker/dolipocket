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

dol_include_once('/dolipocket/smartmaker-api/Trait/PaginatedListTrait.php');
dol_include_once('/dolipocket/smartmaker-api/dmProduct.php');

require_once DOL_DOCUMENT_ROOT.'/product/class/product.class.php';

use Product;
use Dolipocket\Api\Trait\PaginatedListTrait;
use SmartAuth\DolibarrMapping\MapperValidationException;

/**
 * REST API controller for Dolibarr products and services (Product class).
 *
 * Endpoints exposed:
 *   GET    product           list (legacy or DataTable paginated)
 *   GET    product/columns   DataTable column catalog
 *   GET    product/count     DataTable total count for current filters
 *   GET    product/{id}      fetch a single product
 *   POST   product           create
 *   PUT    product/{id}      update
 *   DELETE product           bulk delete by ids[]
 *   DELETE product/{id}      delete one
 */
class ProductController
{
    use PaginatedListTrait;

    /**
     * Default ORDER BY (without the leading keyword) when no sort is requested.
     *
     * @var string
     */
    private static $defaultSort = 'p.ref ASC, p.rowid ASC';

    /**
     * @var dmProduct Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor: instantiate the mapper once per request.
     */
    public function __construct()
    {
        $this->mapper = new dmProduct();
    }

    /**
     * List products and services for the current entity.
     *
     * Two response shapes (cf docs/DATATABLE_SPEC.md section 4.3):
     *   - Legacy raw array (when no DataTable list params are present). Keeps
     *     historical 'type', 'q', 'status', 'page', 'limit' query semantics.
     *   - Paginated envelope {items, total, page, limit} when at least one of
     *     search/filter[*]/sort/page/limit is provided.
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::index access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (!$this->hasListParams($arr)) {
            return $this->indexLegacy($arr);
        }

        $params = $this->parseListParams($arr);
        $includeKeys = $this->parseIncludeKeys($arr);

        $baseFrom = " FROM ".MAIN_DB_PREFIX."product as p";
        $baseWhere = " WHERE p.entity IN (".getEntity('product').")";
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'p');
        $where = $baseWhere.$filterWhere;

        $countSql = "SELECT COUNT(p.rowid) as nb".$baseFrom.$where;
        $countRes = $db->query($countSql);
        if (!$countRes) {
            dol_syslog("DPK ProductController::index count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $countRow = $db->fetch_object($countRes);
        $total = $countRow ? (int) $countRow->nb : 0;
        $db->free($countRes);

        $orderBy = $this->buildSortClauseFromCatalog($params, $this->mapper, 'p', self::$defaultSort);
        $sql = "SELECT p.rowid".$baseFrom.$where.$orderBy;
        $sql .= $db->plimit((int) $params['limit'], (int) $params['offset']);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProductController::index page SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $product = new Product($db);
            if ($product->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ProductController::index could not fetch product ".$obj->rowid, LOG_WARNING);
                continue;
            }
            $product->fetch_optionals();
            $items[] = $this->mapper->exportMappedDataFiltered($product, $includeKeys);
        }
        $db->free($resql);

        return [
            $this->formatPaginatedResponse($items, $total, (int) $params['page'], (int) $params['limit']),
            200,
        ];
    }

    /**
     * GET product/columns
     *
     * Returns the normalized column catalog for the DataTable consumer
     * (cf docs/DATATABLE_SPEC.md section 13).
     *
     * @param   array|null  $arr  Unused.
     * @return  array              [data, httpCode]
     */
    public function columns($arr = null)
    {
        global $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::columns access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->getColumnCatalog(), 200];
    }

    /**
     * GET product/describe
     *
     * Returns the raw objectDesc() output (per-field metadata) for AutoForm.
     * Cf .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
     *
     * @param  array|null $arr
     * @return array
     */
    public function describe($arr = null)
    {
        global $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::describe access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        return [$this->mapper->objectDesc(), 200];
    }

    /**
     * GET product/count
     *
     * Returns {total: N} matching the current filters.
     *
     * @param   array|null  $arr  Query parameters (search, filter[...]).
     * @return  array              [data, httpCode]
     */
    public function count($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::count access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $params = $this->parseListParams($arr);
        list($filterWhere, ) = $this->buildSqlFiltersFromCatalog($params, $this->mapper, 'p');

        $sql = "SELECT COUNT(p.rowid) as nb";
        $sql .= " FROM ".MAIN_DB_PREFIX."product as p";
        $sql .= " WHERE p.entity IN (".getEntity('product').")";
        $sql .= $filterWhere;

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProductController::count SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }
        $row = $db->fetch_object($resql);
        $total = $row ? (int) $row->nb : 0;
        $db->free($resql);

        return [['total' => $total], 200];
    }

    /**
     * DELETE product (bulk)
     *
     * Body: { ids: [1, 2, ...] }, max 100. Each id is attempted independently.
     * Returns {success: [...ids], errors: [{id, reason}, ...]}.
     *
     * @param   array|null  $arr  Body payload.
     * @return  array              [data, httpCode]
     */
    public function deleteBulk($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'supprimer') && !$user->hasRight('service', 'supprimer')) {
            dol_syslog("DPK ProductController::deleteBulk access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $rawIds = (is_array($arr) && isset($arr['ids']) && is_array($arr['ids'])) ? $arr['ids'] : null;
        if ($rawIds === null) {
            dol_syslog("DPK ProductController::deleteBulk missing or invalid 'ids' payload", LOG_WARNING);
            return [['error' => "Body must include an 'ids' array of integers"], 400];
        }

        $ids = [];
        foreach ($rawIds as $id) {
            $idInt = (int) $id;
            if ($idInt > 0) {
                $ids[] = $idInt;
            }
        }
        $ids = array_values(array_unique($ids));

        if (empty($ids)) {
            dol_syslog("DPK ProductController::deleteBulk empty 'ids' after sanitization", LOG_WARNING);
            return [['error' => "'ids' must contain at least one positive integer"], 400];
        }

        if (count($ids) > 100) {
            dol_syslog("DPK ProductController::deleteBulk too many ids: ".count($ids), LOG_WARNING);
            return [['error' => "Too many ids (max 100)"], 400];
        }

        $success = [];
        $errors = [];

        foreach ($ids as $id) {
            $product = new Product($db);
            $res = $product->fetch($id);
            if ($res <= 0) {
                dol_syslog("DPK ProductController::deleteBulk product not found id=".$id, LOG_WARNING);
                $errors[] = ['id' => $id, 'reason' => 'Product not found'];
                continue;
            }

            $resDel = $product->delete($user);
            if ($resDel <= 0) {
                $reason = $product->error !== '' ? $product->error : 'Failed to delete';
                dol_syslog("DPK ProductController::deleteBulk failed id=".$id.": ".$reason, LOG_ERR);
                $errors[] = ['id' => $id, 'reason' => $reason];
                continue;
            }

            $success[] = $id;
        }

        return [
            ['success' => $success, 'errors' => $errors],
            200,
        ];
    }

    /**
     * Parse the optional ?include=col1,col2,... query parameter into a
     * whitelist of appside keys. Returns null when absent.
     *
     * @param   array|null $arr
     * @return  array<int,string>|null
     */
    private function parseIncludeKeys($arr)
    {
        if (!is_array($arr) || empty($arr['include'])) {
            return null;
        }
        $raw = (string) $arr['include'];
        $keys = [];
        foreach (explode(',', $raw) as $k) {
            $k = trim($k);
            if ($k !== '') {
                $keys[] = $k;
            }
        }
        return empty($keys) ? null : $keys;
    }

    /**
     * Legacy index handler kept for backward compatibility with callers using
     * the historical 'type'/'q'/'status'/'page'/'limit' query semantics.
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    private function indexLegacy($arr)
    {
        global $db;

        $type = isset($arr['type']) && $arr['type'] !== '' ? (int) $arr['type'] : null;
        $query = isset($arr['q']) ? trim((string) $arr['q']) : '';
        $status = isset($arr['status']) && $arr['status'] !== '' ? (int) $arr['status'] : 1;
        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;

        $sql = "SELECT p.rowid";
        $sql .= " FROM ".MAIN_DB_PREFIX."product as p";
        $sql .= " WHERE p.entity IN (".getEntity('product').")";

        if ($type !== null) {
            $sql .= " AND p.fk_product_type = ".(int) $type;
        }
        if ($status !== -1) {
            $sql .= " AND p.tosell = ".(int) $status;
        }
        if (!empty($query)) {
            $like = "%".$db->escape($query)."%";
            $sql .= " AND (p.ref LIKE '".$like."' OR p.label LIKE '".$like."' OR p.barcode LIKE '".$like."')";
        }

        $sql .= " ORDER BY p.ref ASC";
        $sql .= $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProductController::indexLegacy SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $product = new Product($db);
            if ($product->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK ProductController::indexLegacy could not fetch product ".$obj->rowid, LOG_WARNING);
                continue;
            }
            $product->fetch_optionals();
            $items[] = $this->formatProduct($product);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single product by id.
     *
     * @param   array|null  $arr  Route parameters (id).
     * @return  array              [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::show access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK ProductController::show missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $id = (int) $arr['id'];
        $product = new Product($db);
        $result = $product->fetch($id);

        if ($result <= 0) {
            dol_syslog("DPK ProductController::show product ".$id." not found", LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }
        $product->fetch_optionals();

        return [$this->formatProduct($product), 200];
    }

    /**
     * Create a product or service.
     *
     * @param   array|null  $arr  Request body.
     * @return  array              [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        $type = isset($arr['type']) ? (int) $arr['type'] : 0;
        $rightObject = ($type === 1) ? 'service' : 'produit';
        if (!$user->hasRight($rightObject, 'creer')) {
            dol_syslog("DPK ProductController::create access denied for user ".$user->id." on $rightObject", LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['ref']) || empty($arr['label'])) {
            dol_syslog("DPK ProductController::create missing ref or label", LOG_WARNING);
            return [['error' => 'Fields ref and label are required'], 400];
        }

        $product = new Product($db);
        $product->ref = (string) $arr['ref'];
        $product->label = (string) $arr['label'];
        $product->type = $type;
        $product->description = isset($arr['description']) ? (string) $arr['description'] : '';
        $product->price = isset($arr['price']) ? (float) $arr['price'] : 0;
        $product->price_ttc = isset($arr['price_ttc']) ? (float) $arr['price_ttc'] : 0;
        $product->price_base_type = 'HT';
        $product->tva_tx = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : 0;
        $product->status = isset($arr['status']) ? (int) $arr['status'] : 1;
        $product->status_buy = isset($arr['status_buy']) ? (int) $arr['status_buy'] : 1;
        $product->finished = 1;
        if (isset($arr['weight'])) {
            $product->weight = (float) $arr['weight'];
        }
        if (isset($arr['length'])) {
            $product->length = (float) $arr['length'];
        }
        if (isset($arr['width'])) {
            $product->width = (float) $arr['width'];
        }
        if (isset($arr['height'])) {
            $product->height = (float) $arr['height'];
        }
        if (isset($arr['barcode'])) {
            $product->barcode = (string) $arr['barcode'];
        }

        $result = $product->create($user);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::create failed: ".$product->error, LOG_ERR);
            return [['error' => 'Failed to create product: '.$product->error], 500];
        }

        // Reload to obtain computed fields (country_code, stock_reel, datec).
        $product->fetch($result);
        $product->fetch_optionals();

        return [$this->formatProduct($product), 201];
    }

    /**
     * Update a product or service.
     *
     * @param   array|null  $arr  Route parameters and body.
     * @return  array              [data, httpCode]
     */
    public function update($arr = null)
    {
        global $db, $user;

        if (empty($arr['id'])) {
            dol_syslog("DPK ProductController::update missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $id = (int) $arr['id'];
        $product = new Product($db);
        $result = $product->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::update product ".$id." not found", LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $rightObject = ((int) $product->type === 1) ? 'service' : 'produit';
        if (!$user->hasRight($rightObject, 'creer')) {
            dol_syslog("DPK ProductController::update access denied for user ".$user->id." on $rightObject", LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        // Extract price-related fields: they must go through updatePrice(),
        // not through direct assignment, so the SQL price log and derived
        // fields (price_min, multicurrency, etc.) stay coherent.
        $priceUpdate = [];
        foreach (['price', 'price_ttc', 'tva_tx'] as $pf) {
            if (isset($arr[$pf])) {
                $priceUpdate[$pf] = $arr[$pf];
            }
        }

        $payload = $arr;
        unset($payload['id'], $payload['price'], $payload['price_ttc'], $payload['tva_tx']);

        try {
            $sanitized = $this->mapper->importMappedData($payload);
        } catch (MapperValidationException $e) {
            dol_syslog("DPK ProductController::update rejected payload: " . json_encode($e->getErrors()), LOG_WARNING);
            return [['errors' => $e->getErrors()], 400];
        }

        foreach (get_object_vars($sanitized) as $field => $value) {
            $product->$field = $value;
        }

        $result = $product->update($product->id, $user);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::update failed: ".$product->error, LOG_ERR);
            return [['error' => 'Failed to update product: '.$product->error], 500];
        }

        // Apply price via dedicated method to keep derived fields coherent.
        // updatePrice() runs AFTER update() so the price log row references
        // the final HT/TVA values, not intermediate ones.
        if (!empty($priceUpdate)) {
            $newPrice = isset($priceUpdate['price'])
                ? (float) $priceUpdate['price']
                : (float) $product->price;
            $newPriceTtc = isset($priceUpdate['price_ttc'])
                ? (float) $priceUpdate['price_ttc']
                : (float) $product->price_ttc;
            $newTva = isset($priceUpdate['tva_tx'])
                ? (float) $priceUpdate['tva_tx']
                : (float) $product->tva_tx;

            $priceResult = $product->updatePrice(
                $newPrice, 'HT', $user, $newTva,
                0, 0, 0, 0, '', [], 0, [], '', $newPriceTtc
            );
            if ($priceResult < 0) {
                dol_syslog("DPK ProductController::update updatePrice failed: ".$product->error, LOG_ERR);
                return [['error' => 'Failed to update price: '.$product->error], 500];
            }
        }

        $product->fetch($id);
        $product->fetch_optionals();

        return [$this->formatProduct($product), 200];
    }

    /**
     * Delete a product or service.
     *
     * @param   array|null  $arr  Route parameters (id).
     * @return  array              [data, httpCode]
     */
    public function delete($arr = null)
    {
        global $db, $user;

        if (empty($arr['id'])) {
            dol_syslog("DPK ProductController::delete missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $id = (int) $arr['id'];
        $product = new Product($db);
        $result = $product->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::delete product ".$id." not found", LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $rightObject = ((int) $product->type === 1) ? 'service' : 'produit';
        if (!$user->hasRight($rightObject, 'supprimer')) {
            dol_syslog("DPK ProductController::delete access denied for user ".$user->id." on $rightObject", LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $result = $product->delete($user);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::delete failed: ".$product->error, LOG_ERR);
            return [['error' => 'Failed to delete product: '.$product->error], 500];
        }

        return [['message' => 'Product deleted'], 200];
    }

    /**
     * GET product/{id}/stock -- physical stock per warehouse (read only).
     *
     * @param array|null $arr
     * @return array
     */
    public function stock($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::stock forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::stock missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::stock not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $product->load_stock();

        require_once DOL_DOCUMENT_ROOT . '/product/stock/class/entrepot.class.php';
        $warehouses = array();
        if (is_array($product->stock_warehouse)) {
            foreach ($product->stock_warehouse as $whId => $sw) {
                $label = '';
                $wh = new \Entrepot($db);
                if ($wh->fetch((int) $whId) > 0) {
                    $label = $wh->label;
                }
                $warehouses[] = array(
                    'warehouseId' => (int) $whId,
                    'label'       => $label,
                    'real'        => isset($sw->real) ? (float) $sw->real : 0,
                );
            }
        }

        return [array(
            'stockReel'  => (float) $product->stock_reel,
            'warehouses' => $warehouses,
        ), 200];
    }

    /**
     * GET product/{id}/suppliers -- supplier purchase prices (read only).
     *
     * @param array|null $arr
     * @return array
     */
    public function suppliers($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::suppliers forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::suppliers missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::suppliers not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.product.class.php';
        $pf = new \ProductFournisseur($db);
        $rows = $pf->list_product_fournisseur_price($id);
        $suppliers = array();
        if (is_array($rows)) {
            foreach ($rows as $r) {
                $suppliers[] = array(
                    'id'           => isset($r->product_fourn_price_id) ? (int) $r->product_fourn_price_id : 0,
                    'supplierId'   => isset($r->fourn_id) ? (int) $r->fourn_id : 0,
                    'supplierName' => isset($r->fourn_name) ? $r->fourn_name : '',
                    'ref'          => isset($r->fourn_ref) ? $r->fourn_ref : '',
                    'qty'          => isset($r->fourn_qty) ? (float) $r->fourn_qty : 0,
                    'price'        => isset($r->fourn_price) ? (float) $r->fourn_price : 0,
                    'unitPrice'    => isset($r->fourn_unitprice) ? (float) $r->fourn_unitprice : 0,
                );
            }
        }

        return [['suppliers' => $suppliers], 200];
    }

    /**
     * GET product/{id}/prices -- base price + customer multiprice levels (read).
     *
     * @param array|null $arr
     * @return array
     */
    public function prices($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::prices forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::prices missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::prices not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $multiEnabled = !empty($conf->global->PRODUIT_MULTIPRICES);
        $levels = array();
        if ($multiEnabled && is_array($product->multiprices)) {
            $limit = (int) getDolGlobalString('PRODUIT_MULTIPRICES_LIMIT', '5');
            for ($l = 1; $l <= $limit; $l++) {
                if (!isset($product->multiprices[$l])) {
                    continue;
                }
                $levels[] = array(
                    'level'    => $l,
                    'priceHt'  => (float) $product->multiprices[$l],
                    'priceTtc' => isset($product->multiprices_ttc[$l]) ? (float) $product->multiprices_ttc[$l] : 0,
                    'tvaTx'    => isset($product->multiprices_tva_tx[$l]) ? (float) $product->multiprices_tva_tx[$l] : 0,
                );
            }
        }

        return [array(
            'multiEnabled'  => $multiEnabled,
            'priceHt'       => (float) $product->price,
            'priceTtc'      => (float) $product->price_ttc,
            'tvaTx'         => (float) $product->tva_tx,
            'priceBaseType' => $product->price_base_type,
            'levels'        => $levels,
        ), 200];
    }

    /**
     * POST product/{id}/price -- set the customer selling price (base or a
     * multiprice level). Tier A lot A4.
     *
     * Body:
     *   - price            (float, required)  the price value
     *   - price_base_type  ('HT'|'TTC')       how `price` is expressed (default HT)
     *   - vat_tx           (float, required)  VAT rate (decimal, e.g. 20)
     *   - level            (int, optional)    multiprice level (1..N). Defaults
     *                       to 1 (base price). Forced to 1 when PRODUIT_MULTIPRICES
     *                       is disabled; a level > 1 needs that option enabled.
     *   - min_price        (float, optional)  minimum selling price (default 0)
     *
     * Faithful to product/price.php: Product::updatePrice() handles the TTC->HT
     * conversion itself, so price_base_type MUST match how `price` is expressed.
     *
     * @param array|null $arr
     * @return array
     */
    public function setPrice($arr = null)
    {
        global $db, $user, $conf;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::setPrice forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::setPrice missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }
        if (!isset($arr['price']) || $arr['price'] === '') {
            dol_syslog("DPK ProductController::setPrice missing price", LOG_WARNING);
            return [['error' => 'price is required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::setPrice not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $price = (float) $arr['price'];
        $priceBaseType = (isset($arr['price_base_type']) && strtoupper((string) $arr['price_base_type']) === 'TTC') ? 'TTC' : 'HT';
        $vatTx = isset($arr['vat_tx']) ? (string) $arr['vat_tx'] : (string) $product->tva_tx;
        $minPrice = isset($arr['min_price']) ? (float) $arr['min_price'] : 0;

        // Resolve the price level. Without PRODUIT_MULTIPRICES there is a single
        // level (1 = base price). With it, accept 1..limit.
        $multiEnabled = !empty($conf->global->PRODUIT_MULTIPRICES);
        $level = isset($arr['level']) ? (int) $arr['level'] : 1;
        if ($level < 1) {
            $level = 1;
        }
        if (!$multiEnabled) {
            $level = 1;
        } else {
            $limit = (int) getDolGlobalString('PRODUIT_MULTIPRICES_LIMIT', '5');
            if ($level > $limit) {
                dol_syslog("DPK ProductController::setPrice level " . $level . " above limit " . $limit, LOG_WARNING);
                return [['error' => 'Price level above the configured multiprice limit'], 400];
            }
        }

        $res = $product->updatePrice($price, $priceBaseType, $user, $vatTx, $minPrice, $level);
        if ($res <= 0) {
            $reason = $product->error !== '' ? $product->error : 'Failed to update price';
            dol_syslog("DPK ProductController::setPrice updatePrice() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to update price: ' . $reason], 500];
        }

        // Return the fresh price block (re-reads the product).
        return $this->prices(['id' => $id]);
    }

    /**
     * POST product/{id}/supplier-price -- create or update a supplier purchase
     * price. Tier A lot A4.
     *
     * Body:
     *   - supplier_id      (int, required)
     *   - ref_supplier     (string, required) supplier product reference
     *   - qty              (float, optional)  quantity bracket (default 1)
     *   - buy_price        (float, required)  purchase price for `qty`
     *   - price_base_type  ('HT'|'TTC')       default HT
     *   - vat_tx           (float, optional)  VAT rate (default 0)
     *
     * Faithful to product/fournisseurs.php: add_fournisseur() ensures the
     * (supplier, ref, qty) row exists (and sets product_fourn_price_id), then
     * update_buyprice() fills the price. The unique key is (fk_soc, ref_fourn,
     * quantity); changing qty creates a separate bracket.
     *
     * @param array|null $arr
     * @return array
     */
    public function setSupplierPrice($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::setSupplierPrice forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $supplierId = isset($arr['supplier_id']) ? (int) $arr['supplier_id'] : 0;
        $refSupplier = isset($arr['ref_supplier']) ? trim((string) $arr['ref_supplier']) : '';
        if ($id <= 0) {
            dol_syslog("DPK ProductController::setSupplierPrice missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }
        if ($supplierId <= 0 || $refSupplier === '') {
            dol_syslog("DPK ProductController::setSupplierPrice missing supplier_id or ref_supplier", LOG_WARNING);
            return [['error' => 'supplier_id and ref_supplier are required'], 400];
        }
        if (!isset($arr['buy_price']) || $arr['buy_price'] === '') {
            dol_syslog("DPK ProductController::setSupplierPrice missing buy_price", LOG_WARNING);
            return [['error' => 'buy_price is required'], 400];
        }

        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.product.class.php';
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';

        $pf = new \ProductFournisseur($db);
        if ($pf->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::setSupplierPrice product not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $supplier = new \Societe($db);
        if ($supplier->fetch($supplierId) <= 0) {
            dol_syslog("DPK ProductController::setSupplierPrice supplier not found id=" . $supplierId, LOG_WARNING);
            return [['error' => 'Supplier not found'], 404];
        }

        $qty = isset($arr['qty']) && (float) $arr['qty'] > 0 ? (float) $arr['qty'] : 1;
        $buyPrice = (float) $arr['buy_price'];
        $priceBaseType = (isset($arr['price_base_type']) && strtoupper((string) $arr['price_base_type']) === 'TTC') ? 'TTC' : 'HT';
        $vatTx = isset($arr['vat_tx']) ? (float) $arr['vat_tx'] : 0;

        // Ensure the (supplier, ref, qty) coupling exists and capture its
        // product_fourn_price_id so update_buyprice updates the right row.
        $ret = $pf->add_fournisseur($user, $supplierId, $refSupplier, $qty);
        if ($ret == -3) {
            $linked = isset($pf->product_id_already_linked) ? (int) $pf->product_id_already_linked : 0;
            dol_syslog("DPK ProductController::setSupplierPrice ref already linked to product=" . $linked, LOG_WARNING);
            return [['error' => 'This supplier reference is already linked to another product (id=' . $linked . ')'], 400];
        }
        if ($ret < 0) {
            $reason = $pf->error !== '' ? $pf->error : 'Failed to register supplier reference';
            dol_syslog("DPK ProductController::setSupplierPrice add_fournisseur() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to register supplier reference: ' . $reason], 500];
        }

        // update_buyprice signature (mirrors product/fournisseurs.php, no
        // multicurrency): qty, buyprice, user, price_base_type, fourn(Societe),
        // availability, ref_fourn, tva_tx, charges, remise_percent, remise,
        // npr, delivery_time_days, supplier_reputation, localtaxes_array,
        // defaultvatcode, mc_buyprice, mc_price_base_type, mc_tx, mc_code.
        $res = $pf->update_buyprice($qty, $buyPrice, $user, $priceBaseType, $supplier, 0, $refSupplier, $vatTx, 0, 0, 0, 0, 0, '', array(), '', 0, 'HT', 1, '');
        if ($res < 0) {
            $reason = $pf->error !== '' ? $pf->error : 'Failed to update supplier price';
            dol_syslog("DPK ProductController::setSupplierPrice update_buyprice() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to update supplier price: ' . $reason], 500];
        }

        // Return the fresh supplier price list.
        return $this->suppliers(['id' => $id]);
    }

    /**
     * DELETE product/{id}/supplier-price/{rowid} -- remove one supplier price
     * bracket. Tier A lot A4.
     *
     * @param array|null $arr
     * @return array
     */
    public function deleteSupplierPrice($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::deleteSupplierPrice forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $rowid = isset($arr['rowid']) ? (int) $arr['rowid'] : 0;
        if ($id <= 0 || $rowid <= 0) {
            dol_syslog("DPK ProductController::deleteSupplierPrice missing id or rowid", LOG_WARNING);
            return [['error' => 'Product id and price rowid are required'], 400];
        }

        // Validate the product (respects entity isolation) before touching the
        // price row.
        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::deleteSupplierPrice product not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.product.class.php';
        $pf = new \ProductFournisseur($db);
        if ($pf->fetch_product_fournisseur_price($rowid) <= 0) {
            dol_syslog("DPK ProductController::deleteSupplierPrice price row not found rowid=" . $rowid, LOG_WARNING);
            return [['error' => 'Supplier price not found'], 404];
        }
        // Make sure the price row really belongs to the product in the URL.
        if ((int) $pf->id !== $id) {
            dol_syslog("DPK ProductController::deleteSupplierPrice rowid=" . $rowid . " does not belong to product=" . $id, LOG_WARNING);
            return [['error' => 'Supplier price does not belong to this product'], 400];
        }

        $res = $pf->remove_product_fournisseur_price($rowid);
        if ($res <= 0) {
            $reason = $pf->error !== '' ? $pf->error : 'Failed to remove supplier price';
            dol_syslog("DPK ProductController::deleteSupplierPrice remove() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to remove supplier price: ' . $reason], 500];
        }

        return $this->suppliers(['id' => $id]);
    }

    // ======================================================================
    // Tier A - A6a : product variants (attributes, values, combinations).
    // Faithful to product/class/api_products.class.php + the variants module
    // classes. Attribute refs/values refs are FORCED to UPPERCASE by the
    // Dolibarr create() methods. Delete is blocked by isUsed() guards.
    // ======================================================================

    /** Load the Dolibarr variant module classes (idempotent). */
    private function loadVariantClasses()
    {
        require_once DOL_DOCUMENT_ROOT . '/variants/class/ProductAttribute.class.php';
        require_once DOL_DOCUMENT_ROOT . '/variants/class/ProductAttributeValue.class.php';
        require_once DOL_DOCUMENT_ROOT . '/variants/class/ProductCombination.class.php';
        require_once DOL_DOCUMENT_ROOT . '/variants/class/ProductCombination2ValuePair.class.php';
    }

    /**
     * Build the global variant-attributes payload (each attribute + its values),
     * tenant-filtered by entity (llx_product_attribute has its own entity
     * column). Shared by attributes() and every attribute mutation endpoint
     * (they return the fresh list).
     *
     * @return array<int,array>
     */
    private function buildAttributesPayload()
    {
        global $db;
        $this->loadVariantClasses();

        $attributes = array();
        $sql = "SELECT rowid, ref, label, position FROM " . MAIN_DB_PREFIX . "product_attribute";
        $sql .= " WHERE entity IN (" . getEntity('product') . ")";
        $sql .= " ORDER BY position, ref";
        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK ProductController::buildAttributesPayload query failed: " . $db->lasterror(), LOG_ERR);
            return $attributes;
        }
        while ($obj = $db->fetch_object($resql)) {
            $attrId = (int) $obj->rowid;
            $values = array();
            $valObj = new \ProductAttributeValue($db);
            $list = $valObj->fetchAllByProductAttribute($attrId);
            if (is_array($list)) {
                foreach ($list as $v) {
                    $values[] = array(
                        'id'    => (int) $v->id,
                        'ref'   => (string) $v->ref,
                        'value' => (string) $v->value,
                    );
                }
            }
            $attributes[] = array(
                'id'       => $attrId,
                'ref'      => (string) $obj->ref,
                'label'    => (string) $obj->label,
                'position' => (int) $obj->position,
                'values'   => $values,
            );
        }
        $db->free($resql);
        return $attributes;
    }

    /** GET product/attributes -- list global variant attributes + their values. */
    public function attributes($arr = null)
    {
        global $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::attributes forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        return [['attributes' => $this->buildAttributesPayload()], 200];
    }

    /** POST product/attribute -- create a variant attribute. Body: ref, label. */
    public function addAttribute($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::addAttribute forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $ref = isset($arr['ref']) ? trim((string) $arr['ref']) : '';
        $label = isset($arr['label']) ? trim((string) $arr['label']) : '';
        if ($ref === '' || $label === '') {
            dol_syslog("DPK ProductController::addAttribute missing ref or label", LOG_WARNING);
            return [['error' => 'ref and label are required'], 400];
        }

        $this->loadVariantClasses();
        $attr = new \ProductAttribute($db);
        $attr->ref = $ref;     // create() forces UPPERCASE
        $attr->label = $label;
        $res = $attr->create($user);
        if ($res <= 0) {
            $reason = !empty($attr->error) ? $attr->error : 'Failed to create attribute';
            dol_syslog("DPK ProductController::addAttribute create() failed: " . $reason, LOG_ERR);
            return [['error' => 'Failed to create attribute: ' . $reason], 400];
        }

        return [['attributes' => $this->buildAttributesPayload()], 201];
    }

    /** PUT product/attribute/{id} -- rename a variant attribute. Body: ref, label. */
    public function updateAttribute($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::updateAttribute forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::updateAttribute missing id", LOG_WARNING);
            return [['error' => 'Attribute id is required'], 400];
        }

        $this->loadVariantClasses();
        $attr = new \ProductAttribute($db);
        if ($attr->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::updateAttribute not found id=" . $id, LOG_WARNING);
            return [['error' => 'Attribute not found'], 404];
        }
        if (isset($arr['ref']) && trim((string) $arr['ref']) !== '') {
            $attr->ref = trim((string) $arr['ref']);
        }
        if (isset($arr['label'])) {
            $attr->label = trim((string) $arr['label']);
        }
        $res = $attr->update($user);
        if ($res <= 0) {
            $reason = !empty($attr->error) ? $attr->error : 'Failed to update attribute';
            dol_syslog("DPK ProductController::updateAttribute update() failed id=" . $id . ": " . $reason, LOG_ERR);
            return [['error' => 'Failed to update attribute: ' . $reason], 400];
        }

        return [['attributes' => $this->buildAttributesPayload()], 200];
    }

    /** DELETE product/attribute/{id} -- delete an attribute (blocked if used). */
    public function deleteAttribute($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'supprimer') && !$user->hasRight('service', 'supprimer')) {
            dol_syslog("DPK ProductController::deleteAttribute forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::deleteAttribute missing id", LOG_WARNING);
            return [['error' => 'Attribute id is required'], 400];
        }

        $this->loadVariantClasses();
        $attr = new \ProductAttribute($db);
        if ($attr->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::deleteAttribute not found id=" . $id, LOG_WARNING);
            return [['error' => 'Attribute not found'], 404];
        }
        $res = $attr->delete($user);
        if ($res <= 0) {
            $reason = !empty($attr->error)
                ? $attr->error
                : ((is_array($attr->errors) && !empty($attr->errors)) ? implode(', ', $attr->errors) : 'Attribute is used by a variant');
            dol_syslog("DPK ProductController::deleteAttribute delete() blocked id=" . $id . ": " . $reason, LOG_WARNING);
            return [['error' => 'Cannot delete attribute (it may be used by a variant): ' . $reason], 400];
        }

        return [['attributes' => $this->buildAttributesPayload()], 200];
    }

    /** POST product/attribute/{id}/value -- add a value. Body: ref, value. */
    public function addAttributeValue($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::addAttributeValue forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $ref = isset($arr['ref']) ? trim((string) $arr['ref']) : '';
        $value = isset($arr['value']) ? trim((string) $arr['value']) : '';
        if ($id <= 0) {
            dol_syslog("DPK ProductController::addAttributeValue missing attribute id", LOG_WARNING);
            return [['error' => 'Attribute id is required'], 400];
        }
        if ($ref === '' || $value === '') {
            dol_syslog("DPK ProductController::addAttributeValue missing ref or value", LOG_WARNING);
            return [['error' => 'ref and value are required'], 400];
        }

        $this->loadVariantClasses();
        $attr = new \ProductAttribute($db);
        if ($attr->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::addAttributeValue attribute not found id=" . $id, LOG_WARNING);
            return [['error' => 'Attribute not found'], 404];
        }
        $val = new \ProductAttributeValue($db);
        $val->fk_product_attribute = $id;
        $val->ref = $ref;     // create() forces UPPERCASE
        $val->value = $value;
        $res = $val->create($user);
        if ($res <= 0) {
            $reason = !empty($val->error) ? $val->error : 'Failed to create attribute value';
            dol_syslog("DPK ProductController::addAttributeValue create() failed attr=" . $id . ": " . $reason, LOG_ERR);
            return [['error' => 'Failed to create attribute value: ' . $reason], 400];
        }

        return [['attributes' => $this->buildAttributesPayload()], 201];
    }

    /** DELETE product/attribute/{id}/value/{valueId} -- delete a value (blocked if used). */
    public function deleteAttributeValue($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'supprimer') && !$user->hasRight('service', 'supprimer')) {
            dol_syslog("DPK ProductController::deleteAttributeValue forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $valueId = isset($arr['valueId']) ? (int) $arr['valueId'] : 0;
        if ($id <= 0 || $valueId <= 0) {
            dol_syslog("DPK ProductController::deleteAttributeValue missing id or valueId", LOG_WARNING);
            return [['error' => 'Attribute id and value id are required'], 400];
        }

        $this->loadVariantClasses();
        $val = new \ProductAttributeValue($db);
        if ($val->fetch($valueId) <= 0) {
            dol_syslog("DPK ProductController::deleteAttributeValue value not found id=" . $valueId, LOG_WARNING);
            return [['error' => 'Attribute value not found'], 404];
        }
        if ((int) $val->fk_product_attribute !== $id) {
            dol_syslog("DPK ProductController::deleteAttributeValue value=" . $valueId . " not under attribute=" . $id, LOG_WARNING);
            return [['error' => 'Attribute value does not belong to this attribute'], 400];
        }
        $res = $val->delete($user);
        if ($res <= 0) {
            $reason = !empty($val->error)
                ? $val->error
                : ((is_array($val->errors) && !empty($val->errors)) ? implode(', ', $val->errors) : 'Value is used by a variant');
            dol_syslog("DPK ProductController::deleteAttributeValue delete() blocked id=" . $valueId . ": " . $reason, LOG_WARNING);
            return [['error' => 'Cannot delete attribute value (it may be used by a variant): ' . $reason], 400];
        }

        return [['attributes' => $this->buildAttributesPayload()], 200];
    }

    /**
     * Build the combinations payload for a parent product (each combination +
     * its (attribute,value) pairs + the child product ref/label).
     *
     * @param int $productId
     * @return array<int,array>
     */
    private function buildCombinationsPayload($productId)
    {
        global $db;
        $this->loadVariantClasses();

        $combinations = array();
        $prodcomb = new \ProductCombination($db);
        $list = $prodcomb->fetchAllByFkProductParent((int) $productId);
        if (!is_array($list)) {
            return $combinations;
        }
        foreach ($list as $comb) {
            $pairs = array();
            $c2v = new \ProductCombination2ValuePair($db);
            $vp = $c2v->fetchByFkCombination((int) $comb->id);
            if (is_array($vp)) {
                foreach ($vp as $pair) {
                    $pairs[] = array(
                        'attributeId' => (int) $pair->fk_prod_attr,
                        'valueId'     => (int) $pair->fk_prod_attr_val,
                    );
                }
            }
            $childRef = '';
            $childLabel = '';
            if (!empty($comb->fk_product_child)) {
                $child = new Product($db);
                if ($child->fetch((int) $comb->fk_product_child) > 0) {
                    $childRef = (string) $child->ref;
                    $childLabel = (string) $child->label;
                }
            }
            $combinations[] = array(
                'id'                       => (int) $comb->id,
                'childId'                  => (int) $comb->fk_product_child,
                'childRef'                 => $childRef,
                'childLabel'               => $childLabel,
                'variationPrice'           => (float) $comb->variation_price,
                'variationPricePercentage' => $comb->variation_price_percentage ? 1 : 0,
                'variationWeight'          => (float) $comb->variation_weight,
                'pairs'                    => $pairs,
            );
        }
        return $combinations;
    }

    /** GET product/{id}/combinations -- variant combinations of a parent product. */
    public function combinations($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'lire') && !$user->hasRight('service', 'lire')) {
            dol_syslog("DPK ProductController::combinations forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::combinations missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }

        // Validate the parent product (entity isolation) before listing.
        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::combinations product not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        return [['combinations' => $this->buildCombinationsPayload($id)], 200];
    }

    /**
     * POST product/{id}/combination -- create a variant combination from a list
     * of (attribute,value) pairs. Body:
     *   - pairs[] : [{attribute_id, value_id}, ...] (required, >=1)
     *   - price_variation         (float, optional) flat price impact
     *   - weight_variation        (float, optional) flat weight impact
     *   - price_variation_percent (bool, optional) price impact is a percentage
     *   - ref                     (string, optional) forced child ref (else auto)
     * Replicates api_products::addVariant -> ProductCombination::createProductCombination
     * which auto-creates the child product. Returns the fresh combinations list.
     *
     * @param array|null $arr
     * @return array
     */
    public function addCombination($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'creer') && !$user->hasRight('service', 'creer')) {
            dol_syslog("DPK ProductController::addCombination forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK ProductController::addCombination missing id", LOG_WARNING);
            return [['error' => 'Product id is required'], 400];
        }
        $pairs = (isset($arr['pairs']) && is_array($arr['pairs'])) ? $arr['pairs'] : array();
        if (empty($pairs)) {
            dol_syslog("DPK ProductController::addCombination no pairs", LOG_WARNING);
            return [['error' => 'At least one attribute/value pair is required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::addCombination product not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $this->loadVariantClasses();

        // Build the $features map attribute_id => value_id, validating each pair.
        $features = array();
        $attr = new \ProductAttribute($db);
        $val = new \ProductAttributeValue($db);
        foreach ($pairs as $pair) {
            $attrId = (is_array($pair) && isset($pair['attribute_id'])) ? (int) $pair['attribute_id'] : 0;
            $valId = (is_array($pair) && isset($pair['value_id'])) ? (int) $pair['value_id'] : 0;
            if ($attrId <= 0 || $valId <= 0) {
                dol_syslog("DPK ProductController::addCombination invalid pair", LOG_WARNING);
                return [['error' => 'Each pair needs a positive attribute_id and value_id'], 400];
            }
            if ($attr->fetch($attrId) <= 0) {
                dol_syslog("DPK ProductController::addCombination attribute not found id=" . $attrId, LOG_WARNING);
                return [['error' => 'Attribute not found: ' . $attrId], 404];
            }
            if ($val->fetch($valId) <= 0) {
                dol_syslog("DPK ProductController::addCombination value not found id=" . $valId, LOG_WARNING);
                return [['error' => 'Attribute value not found: ' . $valId], 404];
            }
            if ((int) $val->fk_product_attribute !== $attrId) {
                dol_syslog("DPK ProductController::addCombination value=" . $valId . " not under attribute=" . $attrId, LOG_WARNING);
                return [['error' => 'Value ' . $valId . ' does not belong to attribute ' . $attrId], 400];
            }
            $features[$attrId] = $valId;
        }

        $priceVar = isset($arr['price_variation']) ? (float) $arr['price_variation'] : 0.0;
        $weightVar = isset($arr['weight_variation']) ? (float) $arr['weight_variation'] : 0.0;
        $pricePct = !empty($arr['price_variation_percent']);
        $ref = isset($arr['ref']) ? trim((string) $arr['ref']) : '';

        // createProductCombination($user, $product, $features, $variations=[],
        //   $price_var_percent, $forced_pricevar, $forced_weightvar, $forced_refvar, $ref_ext)
        // Passing floats for forced price/weight skips the $variations array.
        $prodcomb = new \ProductCombination($db);
        $res = $prodcomb->createProductCombination($user, $product, $features, array(), $pricePct, $priceVar, $weightVar, ($ref !== '' ? $ref : false), '');
        if ($res <= 0) {
            $reason = !empty($prodcomb->error)
                ? $prodcomb->error
                : ((is_array($prodcomb->errors) && !empty($prodcomb->errors)) ? implode(', ', $prodcomb->errors) : 'Failed to create combination');
            dol_syslog("DPK ProductController::addCombination createProductCombination() failed product=" . $id . ": " . $reason, LOG_ERR);
            return [['error' => 'Failed to create variant combination: ' . $reason], 400];
        }

        return [['combinations' => $this->buildCombinationsPayload($id)], 201];
    }

    /**
     * DELETE product/{id}/combination/{rowid} -- delete a variant combination.
     * Mirrors api_products::deleteVariant (ProductCombination::delete): removes
     * the combination and its value pairs. The auto-created child product is NOT
     * deleted (native REST API behavior); it stays as a standalone product.
     *
     * @param array|null $arr
     * @return array
     */
    public function removeCombination($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('produit', 'supprimer') && !$user->hasRight('service', 'supprimer')) {
            dol_syslog("DPK ProductController::removeCombination forbidden user=" . (int) $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        $rowid = isset($arr['rowid']) ? (int) $arr['rowid'] : 0;
        if ($id <= 0 || $rowid <= 0) {
            dol_syslog("DPK ProductController::removeCombination missing id or rowid", LOG_WARNING);
            return [['error' => 'Product id and combination rowid are required'], 400];
        }

        $product = new Product($db);
        if ($product->fetch($id) <= 0) {
            dol_syslog("DPK ProductController::removeCombination product not found id=" . $id, LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $this->loadVariantClasses();
        $prodcomb = new \ProductCombination($db);
        if ($prodcomb->fetch($rowid) <= 0) {
            dol_syslog("DPK ProductController::removeCombination combination not found rowid=" . $rowid, LOG_WARNING);
            return [['error' => 'Combination not found'], 404];
        }
        if ((int) $prodcomb->fk_product_parent !== $id) {
            dol_syslog("DPK ProductController::removeCombination rowid=" . $rowid . " not under product=" . $id, LOG_WARNING);
            return [['error' => 'Combination does not belong to this product'], 400];
        }
        $res = $prodcomb->delete($user);
        if ($res <= 0) {
            $reason = !empty($prodcomb->error) ? $prodcomb->error : 'Failed to delete combination';
            dol_syslog("DPK ProductController::removeCombination delete() failed rowid=" . $rowid . ": " . $reason, LOG_ERR);
            return [['error' => 'Failed to delete variant combination: ' . $reason], 400];
        }

        return [['combinations' => $this->buildCombinationsPayload($id)], 200];
    }

    /**
     * Format a product through the dmProduct mapper plus a couple of fields
     * the mapper cannot derive automatically (current stock).
     *
     * @param   Product  $product  Loaded product instance.
     * @return  array               API representation.
     */
    private function formatProduct(Product $product)
    {
        $mapped = $this->mapper->exportMappedData($product);
        $data = json_decode(json_encode($mapped), true);

        // Make sure stock_reel is always present even when the underlying
        // property is empty (exportMappedData skips empty values).
        if (!isset($data['stock_reel'])) {
            $data['stock_reel'] = (float) ($product->stock_reel ?? 0);
        }
        if (!isset($data['type'])) {
            $data['type'] = (int) ($product->type ?? 0);
        }
        if (!isset($data['status'])) {
            $data['status'] = (int) ($product->status ?? 0);
        }
        if (!isset($data['status_buy'])) {
            $data['status_buy'] = (int) ($product->status_buy ?? 0);
        }

        return $data;
    }
}
