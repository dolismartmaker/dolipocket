<?php

/**
 * Copyright (c) 2025 Eric Seigne <eric.seigne@cap-rel.fr>
 * Copyright (c) 2025 Paolo Debaisieux <paolo.debaisieux@cap-rel.fr>
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

// CORS handling for development setups where the PWA (vite dev server) and the
// API live on different origins. The whitelist is overridable via the Dolibarr
// constant DOLIPOCKET_CORS_ALLOWED_ORIGINS (comma-separated list, e.g.
// "http://localhost:5173,https://app.example.com"). Fallback covers the
// default vite dev ports. To extend at runtime without touching this file,
// run inside Dolibarr admin:
//   const DOLIPOCKET_CORS_ALLOWED_ORIGINS = "https://my.host"
// The headers list MUST include X-DEVICEID (sent by @cap-rel/smartcommon
// useApi) and DOLENTITY (used for explicit tenant pinning); without them the
// browser rejects the preflight before the request ever reaches the API.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
$customOriginsEnv = function_exists('getDolGlobalString') ? trim(getDolGlobalString('DOLIPOCKET_CORS_ALLOWED_ORIGINS')) : '';
$customOrigins = $customOriginsEnv === '' ? array() : array_filter(array_map('trim', explode(',', $customOriginsEnv)));
$allowedOrigins = array_unique(array_merge($defaultOrigins, $customOrigins));
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: '.$origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Device-Uuid, X-DEVICEID, DOLENTITY');
    header('Vary: Origin');
}

// Handle preflight OPTIONS requests as soon as headers are emitted.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

// Entry-point HTTP: Dolibarr (and dol_include_once) is bootstrapped from this file.
require_once __DIR__.'/../smartmaker-api-prepend.php';

use SmartAuth\Api\RouteController as Route;
use SmartAuth\Api\RouteCache;

use Dolipocket\Api\HomeController;

// Lot 1 - Tiers + Contacts
use Dolipocket\Api\ThirdPartyController;
use Dolipocket\Api\ContactController;

// Lot 2 - Catalogue (Produits + Entrepots + Stock)
use Dolipocket\Api\ProductController;
use Dolipocket\Api\WarehouseController;
use Dolipocket\Api\StockController;

// Lot 3 - Cycle vente (Devis + Commandes + Factures)
use Dolipocket\Api\ProposalController;
use Dolipocket\Api\OrderController;
use Dolipocket\Api\InvoiceController;

// Lot 4 - Cycle achat (Commandes + Factures fournisseur)
use Dolipocket\Api\SupplierOrderController;
use Dolipocket\Api\SupplierInvoiceController;

// Lot 5 - Agenda
use Dolipocket\Api\AgendaController;

// Lot 5 - Document attachment (consume staged uploads)
use Dolipocket\Api\DocumentController;

// Lot 9 - Read-only FK lookups (powered by AutoForm <FkPicker>)
use Dolipocket\Api\ProjectController;
use Dolipocket\Api\UserController;


// Initialize route cache for this module.
RouteCache::init('dolipocket');

// Check if valid cache exists
if (RouteCache::isCacheValid() && RouteCache::loadCache()) {
    // Use cached routes - fast path
    if (Route::dispatch()) {
        exit;
    }
} else {
    // No valid cache - register routes and generate cache
    // Note: SmartAuth routes (login, logout, refresh, device, file, sync, upload, object/...)
    // are automatically loaded from smartauth/api/LocalRoutes.php
    RouteCache::startRegistration();

    // ========== Route Registration ========== //

    // ********** Home ********** //
    Route::get('home', HomeController::class, 'index', true);

    // ********** Lot 1 - Third parties (Societe) ********** //
    Route::get('thirdparty',          ThirdPartyController::class, 'index',      true);
    Route::get('thirdparty/columns',  ThirdPartyController::class, 'columns',    true);
    Route::get('thirdparty/describe', ThirdPartyController::class, 'describe',   true);
    Route::get('thirdparty/count',    ThirdPartyController::class, 'count',      true);
    Route::get('thirdparty/{id}',    ThirdPartyController::class, 'show',       true);
    Route::post('thirdparty',        ThirdPartyController::class, 'create',     true);
    Route::put('thirdparty/{id}',    ThirdPartyController::class, 'update',     true);
    Route::delete('thirdparty',      ThirdPartyController::class, 'deleteBulk', true);
    Route::delete('thirdparty/{id}', ThirdPartyController::class, 'delete',     true);

    // ********** Lot 1 - Contacts ********** //
    Route::get('contact',              ContactController::class, 'index',       true);
    Route::get('contact/columns',      ContactController::class, 'columns',     true);
    Route::get('contact/describe',     ContactController::class, 'describe',    true);
    Route::get('contact/count',        ContactController::class, 'count',       true);
    Route::get('contact/export/vcard', ContactController::class, 'exportVCard', true);
    Route::post('contact/import/vcard', ContactController::class, 'importVCard', true);
    Route::get('contact/{id}',         ContactController::class, 'show',        true);
    Route::post('contact',             ContactController::class, 'create',      true);
    Route::put('contact/{id}',         ContactController::class, 'update',      true);
    Route::delete('contact',           ContactController::class, 'deleteBulk',  true);
    Route::delete('contact/{id}',      ContactController::class, 'delete',      true);

    // ********** Lot 2 - Products / Services ********** //
    Route::get('product',          ProductController::class, 'index',      true);
    Route::get('product/columns',  ProductController::class, 'columns',    true);
    Route::get('product/describe', ProductController::class, 'describe',   true);
    Route::get('product/count',    ProductController::class, 'count',      true);
    Route::get('product/{id}',    ProductController::class, 'show',       true);
    Route::post('product',        ProductController::class, 'create',     true);
    Route::put('product/{id}',    ProductController::class, 'update',     true);
    Route::delete('product',      ProductController::class, 'deleteBulk', true);
    Route::delete('product/{id}', ProductController::class, 'delete',     true);

    // ********** Lot 2 - Warehouses ********** //
    Route::get('warehouse',          WarehouseController::class, 'index',      true);
    Route::get('warehouse/columns',  WarehouseController::class, 'columns',    true);
    Route::get('warehouse/describe', WarehouseController::class, 'describe',   true);
    Route::get('warehouse/count',    WarehouseController::class, 'count',      true);
    Route::get('warehouse/{id}',    WarehouseController::class, 'show',       true);
    Route::post('warehouse',        WarehouseController::class, 'create',     true);
    Route::put('warehouse/{id}',    WarehouseController::class, 'update',     true);
    Route::delete('warehouse',      WarehouseController::class, 'deleteBulk', true);
    Route::delete('warehouse/{id}', WarehouseController::class, 'delete',     true);

    // ********** Lot 2 - Stock movements ********** //
    Route::get('stockmovement',      StockController::class, 'index',  true);
    Route::get('stockmovement/{id}', StockController::class, 'show',   true);
    Route::post('stockmovement',     StockController::class, 'create', true);

    // ********** Lot 3 - Proposals (devis) ********** //
    Route::get('proposal',                       ProposalController::class, 'index',         true);
    Route::get('proposal/columns',               ProposalController::class, 'columns',       true);
    Route::get('proposal/lines/columns',         ProposalController::class, 'linesColumns',  true);
    Route::get('proposal/describe',              ProposalController::class, 'describe',      true);
    Route::get('proposal/count',                 ProposalController::class, 'count',         true);
    Route::get('proposal/{id}',                  ProposalController::class, 'show',          true);
    Route::post('proposal',                      ProposalController::class, 'create',        true);
    Route::put('proposal/{id}',                  ProposalController::class, 'update',        true);
    Route::delete('proposal',                    ProposalController::class, 'deleteBulk',    true);
    Route::delete('proposal/{id}',               ProposalController::class, 'destroy',       true);
    Route::post('proposal/{id}/validate',        ProposalController::class, 'validate',      true);
    Route::post('proposal/{id}/closesign',       ProposalController::class, 'closeSigned',   true);
    Route::post('proposal/{id}/closeunsign',     ProposalController::class, 'closeUnsigned', true);
    Route::post('proposal/{id}/pdf',             ProposalController::class, 'generatePdf',   true);
    Route::get('proposal/{id}/pdf/download',     ProposalController::class, 'download',      true);
    Route::post('proposal/{id}/send',            ProposalController::class, 'send',          true);
    Route::post('proposal/{id}/line',            ProposalController::class, 'addLine',       true);
    Route::put('proposal/{id}/line/{lineid}',    ProposalController::class, 'updateLine',    true);
    Route::delete('proposal/{id}/line/{lineid}', ProposalController::class, 'deleteLine',    true);

    // ********** Lot 3 - Orders (commandes client) ********** //
    Route::get('order/columns',                      OrderController::class, 'columns',            true);
    Route::get('order/lines/columns',                OrderController::class, 'linesColumns',       true);
    Route::get('order/describe',                     OrderController::class, 'describe',           true);
    Route::get('order/count',                        OrderController::class, 'count',              true);
    Route::get('order',                              OrderController::class, 'index',              true);
    Route::get('order/{id}',                         OrderController::class, 'show',               true);
    Route::post('order',                             OrderController::class, 'create',             true);
    Route::put('order/{id}',                         OrderController::class, 'update',             true);
    Route::delete('order',                           OrderController::class, 'deleteBulk',         true);
    Route::delete('order/{id}',                      OrderController::class, 'destroy',            true);
    Route::post('order/{id}/validate',               OrderController::class, 'validate',           true);
    Route::post('order/createfromproposal/{proposalid}', OrderController::class, 'createFromProposal', true);
    Route::post('order/{id}/pdf',                    OrderController::class, 'generatePdf',        true);
    Route::get('order/{id}/pdf/download',            OrderController::class, 'download',           true);
    Route::post('order/{id}/send',                   OrderController::class, 'send',               true);
    Route::post('order/{id}/line',                   OrderController::class, 'addLine',            true);
    Route::put('order/{id}/line/{lineid}',           OrderController::class, 'updateLine',         true);
    Route::delete('order/{id}/line/{lineid}',        OrderController::class, 'deleteLine',         true);

    // ********** Lot 3 - Invoices (factures client) ********** //
    Route::get('invoice/columns',                    InvoiceController::class, 'columns',         true);
    Route::get('invoice/lines/columns',              InvoiceController::class, 'linesColumns',    true);
    Route::get('invoice/describe',                   InvoiceController::class, 'describe',        true);
    Route::get('invoice/count',                      InvoiceController::class, 'count',           true);
    Route::get('invoice',                            InvoiceController::class, 'index',           true);
    Route::get('invoice/{id}',                       InvoiceController::class, 'show',            true);
    Route::post('invoice',                           InvoiceController::class, 'create',          true);
    Route::put('invoice/{id}',                       InvoiceController::class, 'update',          true);
    Route::delete('invoice',                         InvoiceController::class, 'deleteBulk',      true);
    Route::delete('invoice/{id}',                    InvoiceController::class, 'destroy',         true);
    Route::post('invoice/{id}/validate',             InvoiceController::class, 'validate',        true);
    Route::post('invoice/createfromorder/{orderid}', InvoiceController::class, 'createFromOrder', true);
    Route::post('invoice/{id}/pdf',                  InvoiceController::class, 'generatePdf',     true);
    Route::get('invoice/{id}/pdf/download',          InvoiceController::class, 'download',        true);
    Route::post('invoice/{id}/send',                 InvoiceController::class, 'send',            true);
    Route::post('invoice/{id}/payment',              InvoiceController::class, 'pay',             true);
    Route::post('invoice/{id}/line',                 InvoiceController::class, 'addLine',         true);
    Route::put('invoice/{id}/line/{lineid}',         InvoiceController::class, 'updateLine',      true);
    Route::delete('invoice/{id}/line/{lineid}',      InvoiceController::class, 'deleteLine',      true);

    // ********** Lot 4 - Supplier orders ********** //
    Route::get('supplierorder/columns',               SupplierOrderController::class, 'columns',      true);
    Route::get('supplierorder/lines/columns',         SupplierOrderController::class, 'linesColumns', true);
    Route::get('supplierorder/describe',              SupplierOrderController::class, 'describe',     true);
    Route::get('supplierorder/count',                 SupplierOrderController::class, 'count',        true);
    Route::get('supplierorder',                       SupplierOrderController::class, 'index',        true);
    Route::get('supplierorder/{id}',                  SupplierOrderController::class, 'show',         true);
    Route::post('supplierorder',                      SupplierOrderController::class, 'create',     true);
    Route::put('supplierorder/{id}',                  SupplierOrderController::class, 'update',     true);
    Route::delete('supplierorder',                    SupplierOrderController::class, 'deleteBulk', true);
    Route::delete('supplierorder/{id}',               SupplierOrderController::class, 'delete',     true);
    Route::post('supplierorder/{id}/validate',        SupplierOrderController::class, 'validate',   true);
    Route::post('supplierorder/{id}/approve',         SupplierOrderController::class, 'approve',    true);
    Route::post('supplierorder/{id}/order',           SupplierOrderController::class, 'order',      true);
    Route::post('supplierorder/{id}/receive',         SupplierOrderController::class, 'receive',    true);
    Route::post('supplierorder/{id}/pdf',             SupplierOrderController::class, 'generatePdf', true);
    Route::get('supplierorder/{id}/pdf/download',     SupplierOrderController::class, 'download',    true);
    Route::post('supplierorder/{id}/send',            SupplierOrderController::class, 'send',        true);
    Route::post('supplierorder/{id}/line',            SupplierOrderController::class, 'addLine',    true);
    Route::put('supplierorder/{id}/line/{lineid}',    SupplierOrderController::class, 'updateLine', true);
    Route::delete('supplierorder/{id}/line/{lineid}', SupplierOrderController::class, 'deleteLine', true);

    // ********** Lot 4 - Supplier invoices ********** //
    Route::get('supplierinvoice/columns',                    SupplierInvoiceController::class, 'columns',         true);
    Route::get('supplierinvoice/lines/columns',              SupplierInvoiceController::class, 'linesColumns',    true);
    Route::get('supplierinvoice/describe',                   SupplierInvoiceController::class, 'describe',        true);
    Route::get('supplierinvoice/count',                      SupplierInvoiceController::class, 'count',           true);
    Route::get('supplierinvoice',                            SupplierInvoiceController::class, 'index',           true);
    Route::get('supplierinvoice/{id}',                       SupplierInvoiceController::class, 'show',            true);
    Route::post('supplierinvoice',                           SupplierInvoiceController::class, 'create',          true);
    Route::put('supplierinvoice/{id}',                       SupplierInvoiceController::class, 'update',          true);
    Route::delete('supplierinvoice',                         SupplierInvoiceController::class, 'deleteBulk',      true);
    Route::delete('supplierinvoice/{id}',                    SupplierInvoiceController::class, 'delete',          true);
    Route::post('supplierinvoice/{id}/validate',             SupplierInvoiceController::class, 'validate',        true);
    Route::post('supplierinvoice/createfromorder/{orderid}', SupplierInvoiceController::class, 'createFromOrder', true);
    Route::post('supplierinvoice/{id}/pdf',                  SupplierInvoiceController::class, 'generatePdf',     true);
    Route::get('supplierinvoice/{id}/pdf/download',          SupplierInvoiceController::class, 'download',        true);
    Route::post('supplierinvoice/{id}/send',                 SupplierInvoiceController::class, 'send',            true);
    Route::post('supplierinvoice/{id}/payment',              SupplierInvoiceController::class, 'pay',             true);
    Route::post('supplierinvoice/{id}/line',                 SupplierInvoiceController::class, 'addLine',         true);
    Route::put('supplierinvoice/{id}/line/{lineid}',         SupplierInvoiceController::class, 'updateLine',      true);
    Route::delete('supplierinvoice/{id}/line/{lineid}',      SupplierInvoiceController::class, 'deleteLine',      true);

    // ********** Lot 5 - Agenda (ActionComm) ********** //
    Route::get('event',            AgendaController::class, 'index',    true);
    Route::get('event/columns',    AgendaController::class, 'columns',  true);
    Route::get('event/describe',   AgendaController::class, 'describe', true);
    Route::get('event/{id}',       AgendaController::class, 'show',     true);
    Route::post('event',           AgendaController::class, 'create',   true);
    Route::put('event/{id}',       AgendaController::class, 'update',   true);
    Route::post('event/{id}/done', AgendaController::class, 'done',     true);
    Route::delete('event/{id}',    AgendaController::class, 'delete',   true);

    // ********** Document attachment (consume staged upload) ********** //
    // Pairs with SmartAuth's POST /upload: the PWA stages the binary, then
    // calls this route with { upload_id, object_type, object_id, filename }
    // to bind the file to a Dolibarr object directory + llx_ecm_files row.
    Route::post('document/attach', DocumentController::class, 'attach', true);

    // ********** Document listing + binary download (task 4) ********** //
    // GET /document?objectType=<type>&objectId=<id>  -- list files attached
    //     to a given Dolibarr object (Propal, Order, Invoice, ...). Used by
    //     the "Documents" section under <DocumentLinesEditor> on each
    //     PageDetail desktop view.
    // GET /document/{id}/download  -- stream the binary content of an
    //     llx_ecm_files row. The id MUST be the ecm_files rowid (not the
    //     source object id). Permission gated by src_object_type.
    Route::get('document',              DocumentController::class, 'list',     true);
    Route::get('document/{id}/download', DocumentController::class, 'download', true);

    // ********** Lot 9 - Read-only FK lookups (AutoForm <FkPicker>) ********** //
    Route::get('project',      ProjectController::class, 'index', true);
    Route::get('project/{id}', ProjectController::class, 'show',  true);
    Route::get('user',         UserController::class,    'index', true);
    Route::get('user/{id}',    UserController::class,    'show',  true);

    // ========== End Route Registration ========== //

    RouteCache::endRegistration();

    if (RouteCache::loadCache() && Route::dispatch()) {
        exit;
    }
}

// No route matched - return 403
json_reply('Access denied (end)', 403);
