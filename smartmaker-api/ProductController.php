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

        // Apply mutable fields only when provided in the payload.
        if (isset($arr['ref'])) {
            $product->ref = (string) $arr['ref'];
        }
        if (isset($arr['label'])) {
            $product->label = (string) $arr['label'];
        }
        if (isset($arr['description'])) {
            $product->description = (string) $arr['description'];
        }
        if (isset($arr['price']) || isset($arr['price_ttc']) || isset($arr['tva_tx'])) {
            $newPrice = isset($arr['price']) ? (float) $arr['price'] : (float) $product->price;
            $newPriceTtc = isset($arr['price_ttc']) ? (float) $arr['price_ttc'] : (float) $product->price_ttc;
            $newTva = isset($arr['tva_tx']) ? (float) $arr['tva_tx'] : (float) $product->tva_tx;
            // updatePrice handles HT/TTC consistency and avoids stale derived values.
            $priceResult = $product->updatePrice($newPrice, 'HT', $user, $newTva, 0, 0, 0, 0, '', [], 0, [], '', $newPriceTtc);
            if ($priceResult < 0) {
                dol_syslog("DPK ProductController::update updatePrice failed: ".$product->error, LOG_ERR);
                return [['error' => 'Failed to update price: '.$product->error], 500];
            }
        }
        if (isset($arr['status'])) {
            $product->status = (int) $arr['status'];
        }
        if (isset($arr['status_buy'])) {
            $product->status_buy = (int) $arr['status_buy'];
        }
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

        $result = $product->update($product->id, $user);
        if ($result <= 0) {
            dol_syslog("DPK ProductController::update failed: ".$product->error, LOG_ERR);
            return [['error' => 'Failed to update product: '.$product->error], 500];
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
