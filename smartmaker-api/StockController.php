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

require_once DOL_DOCUMENT_ROOT.'/product/class/product.class.php';
require_once DOL_DOCUMENT_ROOT.'/product/stock/class/mouvementstock.class.php';

use Product;
use MouvementStock;

/**
 * REST API controller for stock movements (MouvementStock class).
 *
 * Endpoints exposed:
 *   GET  stockmovement              list with filters (fk_product, fk_entrepot, date range)
 *   GET  stockmovement/{id}         fetch a single movement
 *   POST stockmovement              record a stock correction (uses Product::correct_stock)
 *
 * Stock movements are intentionally append-only: there is no PUT or DELETE
 * because Dolibarr keeps them as an audit trail. To "cancel" a movement,
 * record a counter-movement.
 */
class StockController
{
    /**
     * @var dmStockMovement Mapper for the published API shape.
     */
    private $mapper;

    /**
     * Constructor: instantiate the mapper once per request.
     */
    public function __construct()
    {
        $this->mapper = new dmStockMovement();
    }

    /**
     * List stock movements for the current entity.
     *
     * Query parameters:
     *   fk_product  (int, optional)
     *   fk_entrepot (int, optional)
     *   date_from   (YYYY-MM-DD, optional)
     *   date_to     (YYYY-MM-DD, optional)
     *   page        (int, default 1)
     *   limit       (int, default 50, max 200)
     *
     * @param   array|null  $arr  Query parameters.
     * @return  array              [data, httpCode]
     */
    public function index($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'mouvement', 'lire')) {
            dol_syslog("DPK StockController::index access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        $fkProduct = isset($arr['fk_product']) && $arr['fk_product'] !== '' ? (int) $arr['fk_product'] : null;
        $fkEntrepot = isset($arr['fk_entrepot']) && $arr['fk_entrepot'] !== '' ? (int) $arr['fk_entrepot'] : null;
        $dateFrom = isset($arr['date_from']) ? trim((string) $arr['date_from']) : '';
        $dateTo = isset($arr['date_to']) ? trim((string) $arr['date_to']) : '';
        $page = isset($arr['page']) ? max(1, (int) $arr['page']) : 1;
        $limit = isset($arr['limit']) ? min(200, max(1, (int) $arr['limit'])) : 50;
        $offset = ($page - 1) * $limit;

        // The stock_mouvement table has no direct entity column. Tenant
        // isolation is enforced by joining on the warehouse, which carries
        // entity, and by joining on product (also entity-scoped) so that a
        // movement is visible only when both its warehouse and its product
        // belong to the current tenant.
        $sql = "SELECT sm.rowid";
        $sql .= " FROM ".MAIN_DB_PREFIX."stock_mouvement as sm";
        $sql .= " INNER JOIN ".MAIN_DB_PREFIX."entrepot as e ON e.rowid = sm.fk_entrepot AND e.entity IN (".getEntity('stock').")";
        $sql .= " INNER JOIN ".MAIN_DB_PREFIX."product as p ON p.rowid = sm.fk_product AND p.entity IN (".getEntity('product').")";
        $sql .= " WHERE 1 = 1";

        if ($fkProduct !== null) {
            $sql .= " AND sm.fk_product = ".(int) $fkProduct;
        }
        if ($fkEntrepot !== null) {
            $sql .= " AND sm.fk_entrepot = ".(int) $fkEntrepot;
        }
        if (!empty($dateFrom) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFrom)) {
            $tsFrom = strtotime($dateFrom.' 00:00:00');
            $sql .= " AND sm.datem >= '".$db->idate($tsFrom)."'";
        }
        if (!empty($dateTo) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateTo)) {
            $tsTo = strtotime($dateTo.' 23:59:59');
            $sql .= " AND sm.datem <= '".$db->idate($tsTo)."'";
        }
        $sql .= " ORDER BY sm.datem DESC, sm.rowid DESC";
        $sql .= $db->plimit($limit, $offset);

        $resql = $db->query($sql);
        if (!$resql) {
            dol_syslog("DPK StockController::index SQL error: ".$db->lasterror(), LOG_ERR);
            return [['error' => 'Database error'], 500];
        }

        $items = [];
        while ($obj = $db->fetch_object($resql)) {
            $movement = new MouvementStock($db);
            if ($movement->fetch((int) $obj->rowid) <= 0) {
                dol_syslog("DPK StockController::index could not fetch movement ".$obj->rowid, LOG_WARNING);
                continue;
            }
            $items[] = $this->formatMovement($movement);
        }
        $db->free($resql);

        return [$items, 200];
    }

    /**
     * Get a single stock movement by id.
     *
     * @param   array|null  $arr  Route parameters (id).
     * @return  array              [data, httpCode]
     */
    public function show($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'mouvement', 'lire')) {
            dol_syslog("DPK StockController::show access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['id'])) {
            dol_syslog("DPK StockController::show missing id", LOG_WARNING);
            return [['error' => 'Movement id is required'], 400];
        }

        $id = (int) $arr['id'];
        $movement = new MouvementStock($db);
        $result = $movement->fetch($id);
        if ($result <= 0) {
            dol_syslog("DPK StockController::show movement ".$id." not found", LOG_WARNING);
            return [['error' => 'Movement not found'], 404];
        }

        return [$this->formatMovement($movement), 200];
    }

    /**
     * Record a stock correction.
     *
     * Body parameters:
     *   fk_product       (int, required)
     *   fk_entrepot      (int, required)
     *   qty              (float, required, signed: positive = input, negative = output)
     *   type_mouvement   (int, optional, 0=input transfer, 1=output transfer, 2=output sale, 3=input purchase)
     *                    If omitted, defaults to 0 for qty>=0 and 1 for qty<0.
     *   label            (string, optional)
     *   price            (float, optional, used to update PMP when input)
     *   inventorycode    (string, optional)
     *   datem            (YYYY-MM-DD, optional, defaults to now)
     *
     * @param   array|null  $arr  Request body.
     * @return  array              [data, httpCode]
     */
    public function create($arr = null)
    {
        global $db, $user;

        if (!$user->hasRight('stock', 'mouvement', 'creer')) {
            dol_syslog("DPK StockController::create access denied for user ".$user->id, LOG_WARNING);
            return [['error' => 'Access denied'], 403];
        }

        if (empty($arr['fk_product']) || empty($arr['fk_entrepot'])) {
            dol_syslog("DPK StockController::create missing fk_product or fk_entrepot", LOG_WARNING);
            return [['error' => 'Fields fk_product and fk_entrepot are required'], 400];
        }
        if (!isset($arr['qty']) || $arr['qty'] === '' || (float) $arr['qty'] === 0.0) {
            dol_syslog("DPK StockController::create missing or zero qty", LOG_WARNING);
            return [['error' => 'Field qty is required and must be non-zero'], 400];
        }

        $fkProduct = (int) $arr['fk_product'];
        $fkEntrepot = (int) $arr['fk_entrepot'];
        $qty = (float) $arr['qty'];
        $label = isset($arr['label']) ? (string) $arr['label'] : '';
        $price = isset($arr['price']) ? (float) $arr['price'] : 0;
        $inventorycode = isset($arr['inventorycode']) ? (string) $arr['inventorycode'] : '';

        // Default movement type based on qty sign when not specified.
        if (isset($arr['type_mouvement']) && $arr['type_mouvement'] !== '') {
            $type = (int) $arr['type_mouvement'];
        } else {
            $type = ($qty >= 0) ? 0 : 1;
        }

        // Validate the product exists and is in the current entity.
        $product = new Product($db);
        if ($product->fetch($fkProduct) <= 0) {
            dol_syslog("DPK StockController::create product ".$fkProduct." not found", LOG_WARNING);
            return [['error' => 'Product not found'], 404];
        }

        $db->begin();

        // Capture rowid range before to retrieve the freshly created movement.
        $beforeMaxId = 0;
        $resBefore = $db->query("SELECT MAX(rowid) as max_id FROM ".MAIN_DB_PREFIX."stock_mouvement");
        if ($resBefore) {
            $rowBefore = $db->fetch_object($resBefore);
            $beforeMaxId = (int) ($rowBefore->max_id ?? 0);
            $db->free($resBefore);
        }

        // Use Product::correct_stock as documented in the brief.
        $result = $product->correct_stock($user, $fkEntrepot, $qty, $type, $label, $price, $inventorycode);
        if ($result <= 0) {
            $db->rollback();
            dol_syslog("DPK StockController::create correct_stock failed: ".$product->error, LOG_ERR);
            return [['error' => 'Failed to record stock movement: '.$product->error], 500];
        }

        // Optionally override datem when explicitly provided. Product::correct_stock
        // always uses NOW() so we update afterwards if the caller requested a date.
        $newMovementId = 0;
        $resAfter = $db->query("SELECT rowid FROM ".MAIN_DB_PREFIX."stock_mouvement WHERE rowid > ".$beforeMaxId." AND fk_product = ".(int) $fkProduct." AND fk_entrepot = ".(int) $fkEntrepot." ORDER BY rowid DESC LIMIT 1");
        if ($resAfter) {
            $rowAfter = $db->fetch_object($resAfter);
            $newMovementId = (int) ($rowAfter->rowid ?? 0);
            $db->free($resAfter);
        }
        if ($newMovementId <= 0) {
            $db->rollback();
            dol_syslog("DPK StockController::create could not locate created movement", LOG_ERR);
            return [['error' => 'Movement created but could not be located'], 500];
        }

        if (!empty($arr['datem']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $arr['datem'])) {
            $tsDatem = strtotime($arr['datem'].' 12:00:00');
            $sqlUpd = "UPDATE ".MAIN_DB_PREFIX."stock_mouvement SET datem = '".$db->idate($tsDatem)."' WHERE rowid = ".(int) $newMovementId;
            $resUpd = $db->query($sqlUpd);
            if (!$resUpd) {
                $db->rollback();
                dol_syslog("DPK StockController::create datem override failed: ".$db->lasterror(), LOG_ERR);
                return [['error' => 'Failed to set custom datem'], 500];
            }
        }

        $db->commit();

        // Fetch the resulting movement to return it.
        $movement = new MouvementStock($db);
        if ($movement->fetch($newMovementId) <= 0) {
            dol_syslog("DPK StockController::create could not refetch movement ".$newMovementId, LOG_ERR);
            return [['error' => 'Movement created but could not be reloaded'], 500];
        }

        return [$this->formatMovement($movement), 201];
    }

    /**
     * Format a stock movement through the dmStockMovement mapper.
     *
     * MouvementStock stores qty in $qty and type_mouvement in $type at the
     * PHP level even though the BDD column names are "value" and
     * "type_mouvement". We bridge the difference here so the API output
     * uses canonical BDD names which match the mapper declaration.
     *
     * @param   MouvementStock  $movement  Loaded movement instance.
     * @return  array                       API representation.
     */
    private function formatMovement(MouvementStock $movement)
    {
        // Bridge PHP property names to BDD-style names expected by the mapper.
        $movement->value = $movement->qty;
        $movement->type_mouvement = $movement->type;
        $movement->fk_product = $movement->product_id;
        $movement->fk_entrepot = $movement->warehouse_id;

        $mapped = $this->mapper->exportMappedData($movement);
        $data = json_decode(json_encode($mapped), true);

        // Ensure mandatory numeric fields are always present.
        if (!isset($data['value'])) {
            $data['value'] = (float) ($movement->qty ?? 0);
        }
        if (!isset($data['type_mouvement'])) {
            $data['type_mouvement'] = (int) ($movement->type ?? 0);
        }
        if (!isset($data['fk_product'])) {
            $data['fk_product'] = (int) ($movement->product_id ?? 0);
        }
        if (!isset($data['fk_entrepot'])) {
            $data['fk_entrepot'] = (int) ($movement->warehouse_id ?? 0);
        }

        return $data;
    }
}
