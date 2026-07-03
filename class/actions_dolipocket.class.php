<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

/**
 * \file    dolipocket/class/actions_dolipocket.class.php
 * \ingroup dolipocket
 * \brief   Hook handlers for Dolipocket. The 'smartmaker' context is the most
 *          critical one: declaring per-route validation schemas here is what
 *          prevents SmartAuth from silently truncating every string field to
 *          255 characters (cf SMARTMAKER_STACK.md section 8).
 */

class ActionsDolipocket
{
	/** @var DoliDB */
	public $db;

	/** @var string */
	public $error = '';

	/** @var array */
	public $errors = array();

	/** @var array Hook results propagated to $hookmanager->resArray */
	public $results = array();

	/** @var string Optional output appended after the hook by executeHook() */
	public $resprints;

	/** @var array Contexts handled by this module */
	public $array_of_handled_context;

	public function __construct($db)
	{
		$this->db = $db;
		$this->array_of_handled_context = array('smartmaker');
	}

	/**
	 * Declare per-route validation schemas consumed by SmartAuth's RouteController.
	 *
	 * Without an entry here, SmartAuth\Api\InputSanitizer::sanitizeAll() applies the
	 * generic sanitizer which truncates every string field to 255 characters silently.
	 *
	 * Lookup key format: $schemas['dolipocket']['<METHOD>:<route-pattern>'] = [field => rules]
	 *
	 * Type constants are inlined as string literals on purpose: referencing the
	 * SmartAuth\Api\InputSanitizer class symbol here would force-load it and the
	 * hook runs before the smartauth controllers are involved (load order is not
	 * guaranteed inside initHooks).
	 *
	 * @param   array         $parameters   Hook parameters
	 * @param   array         $schemas      Schemas registry (passed by reference)
	 * @param   string        $action       Current action
	 * @param   HookManager   $hookmanager  Hook manager
	 * @return  int                         0 on success
	 */
	public function smartmaker_addValidationSchemas($parameters, &$schemas, &$action, $hookmanager)
	{
		$TYPE_STRING = 'string';
		$TYPE_INT = 'int';
		$TYPE_FLOAT = 'float';
		$TYPE_BOOL = 'bool';
		$TYPE_EMAIL = 'email';
		$TYPE_RAW = 'raw';
		$TYPE_ARRAY = 'array';
		$TYPE_ALPHANUMERIC = 'alphanumeric';

		$rawEntry = array('type' => $TYPE_RAW);

		// DataTable list/count/bulk-delete schemas (cf docs/DATATABLE_SPEC.md
		// section 4.6 + section 13). Without these, the generic SmartAuth
		// sanitizer would truncate every filter value to 255 chars silently.
		//
		// 'filter' is declared as RAW because SmartAuth's sanitizeArray()
		// re-indexes associative arrays (foreach $value as $item -> $sanitized[]
		// = ...), which would destroy the filter[col]=value structure. The
		// PaginatedListTrait whitelists each filter key against its own
		// $filterMap and escapes every value via DoliDB::escape() before
		// SQL injection, so no security guarantee is lost here.
		//
		// 'include' is the v2 CSV of appside keys the client wants in the
		// response (cf docs/DATATABLE_SPEC.md section 13). It is parsed by
		// the controller against the catalog before being applied, so a
		// 1000-char string is plenty for ~100 column names.
		$listSchema = array(
			'search'  => array('type' => $TYPE_STRING, 'maxLen' => 255),
			'filter'  => $rawEntry,
			'sort'    => array('type' => $TYPE_ALPHANUMERIC),
			'order'   => array('type' => $TYPE_ALPHANUMERIC),
			'page'    => array('type' => $TYPE_INT, 'min' => 1),
			'limit'   => array('type' => $TYPE_INT, 'min' => 1, 'max' => 100),
			'include' => array('type' => $TYPE_STRING, 'maxLen' => 1000),
		);
		$countSchema = array(
			'search' => array('type' => $TYPE_STRING, 'maxLen' => 255),
			'filter' => $rawEntry,
		);
		$columnsSchema = array();
		$bulkDeleteSchema = array(
			'ids' => array('type' => $TYPE_ARRAY, 'itemType' => $TYPE_INT),
		);

		// Email-send schema, shared by the 5 document send routes
		// (Proposal / Order / Invoice / SupplierOrder / SupplierInvoice).
		// 'subject' and 'body' are RAW because they intentionally accept
		// long free text (otherwise SmartAuth's generic sanitizer would cap
		// them at 255 chars and silently truncate a multi-paragraph email).
		// 'to' is a single email; 'cc' / 'bcc' may be a CSV of addresses,
		// validated inside SendEmailTrait::sendEmail() not here.
		// 'attachment_path' is RAW (whitespace + accents in directory names
		// are normal under DOL_DATA_ROOT) and re-checked server-side against
		// DOL_DATA_ROOT so a 1024-char string is plenty.
		$sendEmailSchema = array(
			'id'              => array('type' => $TYPE_INT, 'min' => 1),
			'to'              => array('type' => $TYPE_EMAIL),
			'cc'              => array('type' => $TYPE_STRING, 'maxLen' => 500),
			'bcc'             => array('type' => $TYPE_STRING, 'maxLen' => 500),
			'subject'         => $rawEntry,
			'body'            => $rawEntry,
			'attachment_path' => array('type' => $TYPE_STRING, 'maxLen' => 1024),
			'ishtml'          => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
		);

		// Payment-record schema, shared by the customer + supplier invoice
		// payment routes. 'note' is RAW because users may paste multi-line
		// remittance details (otherwise SmartAuth's generic sanitizer would
		// cap it at 255 chars). 'ref' stays bounded (cheque numbers and
		// "VIR-2025-001" style references are short by convention).
		// 'payment_date' is INT (epoch seconds or milliseconds, normalised
		// server-side via PaginatedListTrait::normalizeTimestamp).
		$paymentSchema = array(
			'id'           => array('type' => $TYPE_INT, 'min' => 1),
			'amount'       => array('type' => $TYPE_FLOAT, 'min' => 0),
			'payment_mode' => array('type' => $TYPE_INT, 'min' => 1),
			'payment_date' => array('type' => $TYPE_INT),
			'ref'          => array('type' => $TYPE_STRING, 'maxLen' => 100),
			'fk_account'   => array('type' => $TYPE_INT, 'min' => 0),
			'note'         => $rawEntry,
		);

		$schemas['dolipocket'] = array(

			// =====================================================================
			// Home (dashboard, menu, permissions). No params today; declared
			// explicitly so SmartAuth's generic sanitizer is bypassed even if
			// the PWA appends a future query param.
			// =====================================================================
			'GET:home' => array(),

			// =====================================================================
			// Lot B1 - Projects (projet). GET:project uses the full $listSchema so
			// it serves BOTH the DataTable (sort/filter/include) AND the AutoForm
			// <FkPicker> (search/page/limit). 'note_*'/'description' are RAW to
			// escape the 255-char sanitize truncation; 'options_*' passes
			// extrafields through. Statuses/clone take only the id (+ flags).
			// =====================================================================
			'GET:project'          => $listSchema,
			'GET:project/columns'  => $columnsSchema,
			'GET:project/describe' => $columnsSchema,
			'GET:project/count'    => $countSchema,
			'DELETE:project'       => $bulkDeleteSchema,
			'POST:project' => array(
				'title'             => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'socid'             => array('type' => $TYPE_INT, 'min' => 0),
				'fk_soc'            => array('type' => $TYPE_INT, 'min' => 0),
				'description'       => $rawEntry,
				'public'            => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'date_start'        => $rawEntry,
				'date_end'          => $rawEntry,
				'fk_opp_status'     => array('type' => $TYPE_INT, 'min' => 0),
				'opp_status'        => array('type' => $TYPE_INT, 'min' => 0),
				'opp_percent'       => array('type' => $TYPE_FLOAT, 'min' => 0),
				'opp_amount'        => array('type' => $TYPE_FLOAT, 'min' => 0),
				'budget_amount'     => array('type' => $TYPE_FLOAT, 'min' => 0),
				'usage_opportunity' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usage_task'        => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usage_bill_time'   => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'options_*'         => $rawEntry,
			),
			'PUT:project/{id}' => array(
				'id'                => array('type' => $TYPE_INT, 'min' => 1),
				'title'             => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'socid'             => array('type' => $TYPE_INT, 'min' => 0),
				'fk_soc'            => array('type' => $TYPE_INT, 'min' => 0),
				'description'       => $rawEntry,
				'public'            => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'date_start'        => $rawEntry,
				'date_end'          => $rawEntry,
				'fk_opp_status'     => array('type' => $TYPE_INT, 'min' => 0),
				'opp_status'        => array('type' => $TYPE_INT, 'min' => 0),
				'opp_percent'       => array('type' => $TYPE_FLOAT, 'min' => 0),
				'opp_amount'        => array('type' => $TYPE_FLOAT, 'min' => 0),
				'budget_amount'     => array('type' => $TYPE_FLOAT, 'min' => 0),
				'usage_opportunity' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usage_task'        => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usage_bill_time'   => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'options_*'         => $rawEntry,
			),
			'POST:project/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/close'    => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/reopen'   => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/clone' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'socid'          => array('type' => $TYPE_INT, 'min' => 0),
				'clone_contacts' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'clone_tasks'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'clone_notes'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'move_date'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			// Lot B2 - project contacts + categories
			'GET:project/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/contact' => array(
				'id'         => array('type' => $TYPE_INT, 'min' => 1),
				'contact_id' => array('type' => $TYPE_INT, 'min' => 1),
				'type_id'    => array('type' => $TYPE_INT, 'min' => 1),
				'source'     => array('type' => $TYPE_STRING, 'maxLen' => 20),
			),
			'DELETE:project/{id}/contact/{rowid}' => array(
				'id'    => array('type' => $TYPE_INT, 'min' => 1),
				'rowid' => array('type' => $TYPE_INT, 'min' => 1),
			),
			'GET:project/{id}/categories' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:project/{id}/category' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'category_id' => array('type' => $TYPE_INT, 'min' => 1),
				'type'        => array('type' => $TYPE_STRING, 'maxLen' => 20),
			),
			'DELETE:project/{id}/category/{categoryId}' => array(
				'id'         => array('type' => $TYPE_INT, 'min' => 1),
				'categoryId' => array('type' => $TYPE_INT, 'min' => 1),
			),
			// Lot B2b - project referents (linked objects)
			'GET:project/{id}/elements' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:project/{id}/element/{type}/{elementId}' => array(
				'id'        => array('type' => $TYPE_INT, 'min' => 1),
				'type'      => array('type' => $TYPE_STRING, 'maxLen' => 40),
				'elementId' => array('type' => $TYPE_INT, 'min' => 1),
			),
			// Lot B5 - project PDF generation
			'POST:project/{id}/generatepdf' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),

			// =====================================================================
			// Lot B3 - Tasks (projet_task). List accepts ?project. note_*/
			// description RAW to escape the 255-char truncation.
			// =====================================================================
			'GET:task'          => $listSchema,
			'GET:task/columns'  => $columnsSchema,
			'GET:task/describe' => $columnsSchema,
			'GET:task/count'    => $countSchema,
			'POST:task' => array(
				'fk_project'       => array('type' => $TYPE_INT, 'min' => 1),
				'label'            => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description'      => $rawEntry,
				'fk_task_parent'   => array('type' => $TYPE_INT, 'min' => 0),
				'date_start'       => $rawEntry,
				'date_end'         => $rawEntry,
				'planned_workload' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'progress'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 100),
				'priority'         => array('type' => $TYPE_INT, 'min' => 0),
				'budget_amount'    => array('type' => $TYPE_FLOAT, 'min' => 0),
				'note_public'      => $rawEntry,
				'note_private'     => $rawEntry,
				'options_*'        => $rawEntry,
			),
			'PUT:task/{id}' => array(
				'id'               => array('type' => $TYPE_INT, 'min' => 1),
				'label'            => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description'      => $rawEntry,
				'fk_task_parent'   => array('type' => $TYPE_INT, 'min' => 0),
				'date_start'       => $rawEntry,
				'date_end'         => $rawEntry,
				'planned_workload' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'progress'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 100),
				'priority'         => array('type' => $TYPE_INT, 'min' => 0),
				'budget_amount'    => array('type' => $TYPE_FLOAT, 'min' => 0),
				'note_public'      => $rawEntry,
				'note_private'     => $rawEntry,
				'options_*'        => $rawEntry,
			),
			'POST:task/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Lot B4 - time spent
			'GET:task/{id}/timespent' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:task/{id}/timespent/summary' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:task/{id}/timespent' => array(
				'id'       => array('type' => $TYPE_INT, 'min' => 1),
				'date'     => $rawEntry,
				'duration' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_user'  => array('type' => $TYPE_INT, 'min' => 0),
				'note'     => $rawEntry,
			),
			'PUT:task/{id}/timespent/{tsid}' => array(
				'id'       => array('type' => $TYPE_INT, 'min' => 1),
				'tsid'     => array('type' => $TYPE_INT, 'min' => 1),
				'date'     => $rawEntry,
				'duration' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_user'  => array('type' => $TYPE_INT, 'min' => 0),
				'note'     => $rawEntry,
			),
			'DELETE:task/{id}/timespent/{tsid}' => array(
				'id'   => array('type' => $TYPE_INT, 'min' => 1),
				'tsid' => array('type' => $TYPE_INT, 'min' => 1),
			),
			'GET:task/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:task/{id}/contact' => array(
				'id'         => array('type' => $TYPE_INT, 'min' => 1),
				'contact_id' => array('type' => $TYPE_INT, 'min' => 1),
				'type_id'    => array('type' => $TYPE_INT, 'min' => 1),
				'source'     => array('type' => $TYPE_STRING, 'maxLen' => 20),
			),
			'DELETE:task/{id}/contact/{rowid}' => array(
				'id'    => array('type' => $TYPE_INT, 'min' => 1),
				'rowid' => array('type' => $TYPE_INT, 'min' => 1),
			),

			// =====================================================================
			// Lot 9 - Read-only FK lookup: User (powered by AutoForm <FkPicker>).
			// =====================================================================
			'GET:user' => array(
				'search' => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'page'   => array('type' => $TYPE_INT, 'min' => 1),
				'limit'  => array('type' => $TYPE_INT, 'min' => 1, 'max' => 200),
			),

			// Read-only FK lookup: Resource (agenda filter <FkPicker>).
			'GET:resource' => array(
				'search' => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'page'   => array('type' => $TYPE_INT, 'min' => 1),
				'limit'  => array('type' => $TYPE_INT, 'min' => 1, 'max' => 200),
			),

			// =====================================================================
			// Lot 1 - Tiers + Contacts
			// =====================================================================

			// DataTable list/count/columns/bulk-delete (cf docs/DATATABLE_SPEC.md).
			'GET:thirdparty'          => $listSchema,
			'GET:thirdparty/columns'  => $columnsSchema,
			'GET:thirdparty/describe' => $columnsSchema,
			'GET:thirdparty/count'    => $countSchema,
			'DELETE:thirdparty'       => $bulkDeleteSchema,
			'GET:thirdparty/{id}/categories' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:thirdparty/{id}/category' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'category_id' => array('type' => $TYPE_INT, 'min' => 1), 'type' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:thirdparty/{id}/category/{categoryId}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'categoryId' => array('type' => $TYPE_INT, 'min' => 1), 'type' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'GET:thirdparty/{id}/bankaccounts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:thirdparty/{id}/bankaccount' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'label' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'bank' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'iban' => array('type' => $TYPE_STRING, 'maxLen' => 64), 'bic' => array('type' => $TYPE_STRING, 'maxLen' => 32), 'owner_name' => array('type' => $TYPE_STRING, 'maxLen' => 255)),
			'DELETE:thirdparty/{id}/bankaccount/{accountId}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'accountId' => array('type' => $TYPE_INT, 'min' => 1)),
			// Tier A - A5c - reusable discounts available for the thirdparty.
			'GET:thirdparty/{id}/discounts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Cockpit - 360 synthesis of the thirdparty (desktop fiche).
			'GET:thirdparty/{id}/cockpit' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Send a free email to the thirdparty. body is raw (no 255 truncation).
			'POST:thirdparty/{id}/email' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'to' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'subject' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'body' => array('type' => $TYPE_RAW), 'cc' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'bcc' => array('type' => $TYPE_STRING, 'maxLen' => 255), 'ishtml' => array('type' => $TYPE_INT)),
			'GET:contact'             => $listSchema,
			'GET:contact/columns'     => $columnsSchema,
			'GET:contact/describe'    => $columnsSchema,
			'GET:contact/count'       => $countSchema,
			'DELETE:contact'          => $bulkDeleteSchema,

			// DataTable schemas for the 7 Tier-1 features (Lot 6 v2 generalisation).
			'GET:product'             => $listSchema,
			'GET:product/columns'     => $columnsSchema,
			'GET:product/describe'    => $columnsSchema,
			'GET:product/count'       => $countSchema,
			'DELETE:product'          => $bulkDeleteSchema,
			'GET:product/{id}/stock'     => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:product/{id}/suppliers' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:product/{id}/prices'    => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Tier A - A4 - product price writing.
			'POST:product/{id}/price' => array(
				'id'              => array('type' => $TYPE_INT, 'min' => 1),
				'price'           => array('type' => $TYPE_FLOAT),
				'price_base_type' => array('type' => $TYPE_STRING, 'maxLen' => 3),
				'vat_tx'          => array('type' => $TYPE_FLOAT),
				'level'           => array('type' => $TYPE_INT, 'min' => 0),
				'min_price'       => array('type' => $TYPE_FLOAT),
			),
			'POST:product/{id}/supplier-price' => array(
				'id'              => array('type' => $TYPE_INT, 'min' => 1),
				'supplier_id'     => array('type' => $TYPE_INT, 'min' => 1),
				'ref_supplier'    => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'qty'             => array('type' => $TYPE_FLOAT),
				'buy_price'       => array('type' => $TYPE_FLOAT),
				'price_base_type' => array('type' => $TYPE_STRING, 'maxLen' => 3),
				'vat_tx'          => array('type' => $TYPE_FLOAT),
			),
			'DELETE:product/{id}/supplier-price/{rowid}' => array(
				'id'    => array('type' => $TYPE_INT, 'min' => 1),
				'rowid' => array('type' => $TYPE_INT, 'min' => 1),
			),
			// Tier A - A6a - product variants (attributes, values, combinations).
			'GET:product/attributes' => array(),
			'POST:product/attribute' => array('ref' => array('type' => $TYPE_STRING, 'maxLen' => 128), 'label' => array('type' => $TYPE_STRING, 'maxLen' => 255)),
			'PUT:product/attribute/{id}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'ref' => array('type' => $TYPE_STRING, 'maxLen' => 128), 'label' => array('type' => $TYPE_STRING, 'maxLen' => 255)),
			'DELETE:product/attribute/{id}' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:product/attribute/{id}/value' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'ref' => array('type' => $TYPE_STRING, 'maxLen' => 128), 'value' => array('type' => $TYPE_STRING, 'maxLen' => 255)),
			'DELETE:product/attribute/{id}/value/{valueId}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'valueId' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:product/{id}/combinations' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:product/{id}/combination' => array(
				'id'                      => array('type' => $TYPE_INT, 'min' => 1),
				'pairs'                   => $rawEntry,
				'price_variation'         => array('type' => $TYPE_FLOAT),
				'weight_variation'        => array('type' => $TYPE_FLOAT),
				'price_variation_percent' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'ref'                     => array('type' => $TYPE_STRING, 'maxLen' => 128),
			),
			'DELETE:product/{id}/combination/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:warehouse'           => $listSchema,
			'GET:warehouse/columns'   => $columnsSchema,
			'GET:warehouse/describe'  => $columnsSchema,
			'GET:warehouse/count'     => $countSchema,
			'DELETE:warehouse'        => $bulkDeleteSchema,
			'GET:proposal'                  => $listSchema,
			'GET:proposal/columns'          => $columnsSchema,
			'GET:proposal/lines/columns'    => $columnsSchema,
			'GET:proposal/describe'         => $columnsSchema,
			'GET:proposal/count'            => $countSchema,
			'DELETE:proposal'               => $bulkDeleteSchema,
			'GET:order'                     => $listSchema,
			'GET:order/columns'             => $columnsSchema,
			'GET:order/lines/columns'       => $columnsSchema,
			'GET:order/describe'            => $columnsSchema,
			'GET:order/count'               => $countSchema,
			'DELETE:order'                  => $bulkDeleteSchema,
			'GET:invoice'                   => $listSchema,
			'GET:invoice/columns'           => $columnsSchema,
			'GET:invoice/lines/columns'     => $columnsSchema,
			'GET:invoice/describe'          => $columnsSchema,
			'GET:invoice/count'             => $countSchema,
			'DELETE:invoice'                => $bulkDeleteSchema,
			'GET:supplierorder'                => $listSchema,
			'GET:supplierorder/columns'        => $columnsSchema,
			'GET:supplierorder/lines/columns'  => $columnsSchema,
			'GET:supplierorder/describe'       => $columnsSchema,
			'GET:supplierorder/count'          => $countSchema,
			'DELETE:supplierorder'             => $bulkDeleteSchema,
			'GET:supplierinvoice'              => $listSchema,
			'GET:supplierinvoice/columns'      => $columnsSchema,
			'GET:supplierinvoice/lines/columns'=> $columnsSchema,
			'GET:supplierinvoice/describe'     => $columnsSchema,
			'GET:supplierinvoice/count'        => $countSchema,
			'DELETE:supplierinvoice'           => $bulkDeleteSchema,

			'POST:thirdparty' => array(
				'name'             => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'name_alias'       => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'code_client'      => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'code_fournisseur' => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'client'           => array('type' => $TYPE_INT, 'min' => 0, 'max' => 3),
				'fournisseur'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'address'          => $rawEntry,
				'zip'              => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'town'             => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'country_code'     => array('type' => $TYPE_STRING, 'maxLen' => 5),
				'phone'            => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'            => array('type' => $TYPE_EMAIL),
				'url'              => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'siren'            => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'siret'            => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'ape'              => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'idprof4'          => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'tva_intra'        => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'tva_assuj'        => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'code_compta'      => array('type' => $TYPE_STRING, 'maxLen' => 24),
				'code_compta_fournisseur' => array('type' => $TYPE_STRING, 'maxLen' => 24),
				'note_public'      => $rawEntry,
				'note_private'     => $rawEntry,
				'status'           => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'options_*'        => $rawEntry,
			),
			'PUT:thirdparty/{id}' => array(
				'id'               => array('type' => $TYPE_INT, 'min' => 1),
				'name'             => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'name_alias'       => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'code_client'      => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'code_fournisseur' => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'client'           => array('type' => $TYPE_INT, 'min' => 0, 'max' => 3),
				'fournisseur'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'address'          => $rawEntry,
				'zip'              => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'town'             => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'country_code'     => array('type' => $TYPE_STRING, 'maxLen' => 5),
				'phone'            => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'            => array('type' => $TYPE_EMAIL),
				'url'              => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'siren'            => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'siret'            => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'ape'              => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'idprof4'          => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'tva_intra'        => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'tva_assuj'        => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'code_compta'      => array('type' => $TYPE_STRING, 'maxLen' => 24),
				'code_compta_fournisseur' => array('type' => $TYPE_STRING, 'maxLen' => 24),
				'note_public'      => $rawEntry,
				'note_private'     => $rawEntry,
				'status'           => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'options_*'        => $rawEntry,
			),
			'POST:contact' => array(
				'civility'     => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'firstname'    => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'lastname'     => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'fk_soc'       => array('type' => $TYPE_INT, 'min' => 0),
				'address'      => $rawEntry,
				'zip'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'town'         => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'country_code' => array('type' => $TYPE_STRING, 'maxLen' => 5),
				'phone_pro'    => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'phone_mobile' => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'phone_perso'  => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fax'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'        => array('type' => $TYPE_EMAIL),
				'statut'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'poste'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'priv'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'default_lang' => array('type' => $TYPE_STRING, 'maxLen' => 6),
				'note_public'  => $rawEntry,
				'note_private' => $rawEntry,
				'options_*'    => $rawEntry,
			),
			'PUT:contact/{id}' => array(
				'id'           => array('type' => $TYPE_INT, 'min' => 1),
				'civility'     => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'firstname'    => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'lastname'     => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'fk_soc'       => array('type' => $TYPE_INT, 'min' => 0),
				'address'      => $rawEntry,
				'zip'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'town'         => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'country_code' => array('type' => $TYPE_STRING, 'maxLen' => 5),
				'phone_pro'    => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'phone_mobile' => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'phone_perso'  => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fax'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'        => array('type' => $TYPE_EMAIL),
				'statut'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'poste'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'priv'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'default_lang' => array('type' => $TYPE_STRING, 'maxLen' => 6),
				'note_public'  => $rawEntry,
				'note_private' => $rawEntry,
				'options_*'    => $rawEntry,
			),

			// =====================================================================
			// Lot 2 - Catalogue (Produits + Entrepots + Stock)
			// =====================================================================

			'POST:product' => array(
				'ref'         => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'label'       => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description' => $rawEntry,
				'type'        => array('type' => $TYPE_INT, 'min' => 0, 'max' => 9),
				'price'       => array('type' => $TYPE_FLOAT),
				'price_ttc'   => array('type' => $TYPE_FLOAT),
				'tva_tx'      => array('type' => $TYPE_FLOAT),
				'weight'      => array('type' => $TYPE_FLOAT),
				'length'      => array('type' => $TYPE_FLOAT),
				'width'       => array('type' => $TYPE_FLOAT),
				'height'      => array('type' => $TYPE_FLOAT),
				'status'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'status_buy'  => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'barcode'     => array('type' => $TYPE_STRING, 'maxLen' => 180),
				'customcode'  => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'seuil_stock_alerte' => array('type' => $TYPE_FLOAT),
				'desiredstock' => array('type' => $TYPE_FLOAT),
				'note_public' => $rawEntry,
				'options_*'   => $rawEntry,
			),
			'PUT:product/{id}' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'ref'         => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'label'       => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description' => $rawEntry,
				'price'       => array('type' => $TYPE_FLOAT),
				'price_ttc'   => array('type' => $TYPE_FLOAT),
				'tva_tx'      => array('type' => $TYPE_FLOAT),
				'weight'      => array('type' => $TYPE_FLOAT),
				'length'      => array('type' => $TYPE_FLOAT),
				'width'       => array('type' => $TYPE_FLOAT),
				'height'      => array('type' => $TYPE_FLOAT),
				'status'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'status_buy'  => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'barcode'     => array('type' => $TYPE_STRING, 'maxLen' => 180),
				'customcode'  => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'seuil_stock_alerte' => array('type' => $TYPE_FLOAT),
				'desiredstock' => array('type' => $TYPE_FLOAT),
				'note_public' => $rawEntry,
				'options_*'   => $rawEntry,
			),
			'POST:warehouse' => array(
				'label'       => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description' => $rawEntry,
				'lieu'        => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'address'     => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'zip'         => array('type' => $TYPE_STRING, 'maxLen' => 10),
				'town'        => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'phone'       => array('type' => $TYPE_STRING, 'maxLen' => 20),
				'fax'         => array('type' => $TYPE_STRING, 'maxLen' => 20),
				'statut'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 3),
				'fk_parent'   => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'   => $rawEntry,
			),
			'PUT:warehouse/{id}' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'label'       => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'description' => $rawEntry,
				'lieu'        => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'address'     => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'zip'         => array('type' => $TYPE_STRING, 'maxLen' => 10),
				'town'        => array('type' => $TYPE_STRING, 'maxLen' => 50),
				'phone'       => array('type' => $TYPE_STRING, 'maxLen' => 20),
				'fax'         => array('type' => $TYPE_STRING, 'maxLen' => 20),
				'statut'      => array('type' => $TYPE_INT, 'min' => 0, 'max' => 3),
				'fk_parent'   => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'   => $rawEntry,
			),
			'POST:stockmovement' => array(
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 1),
				'fk_entrepot'    => array('type' => $TYPE_INT, 'min' => 1),
				'qty'            => array('type' => $TYPE_FLOAT),
				'type_mouvement' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 3),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'price'          => array('type' => $TYPE_FLOAT),
				'inventorycode'  => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'datem'          => array('type' => $TYPE_STRING, 'maxLen' => 32),
			),

			// =====================================================================
			// Lot 3 - Cycle vente (Devis + Commandes + Factures)
			// =====================================================================

			'POST:proposal' => array(
				'socid'             => array('type' => $TYPE_INT, 'min' => 1),
				'fk_soc'            => array('type' => $TYPE_INT, 'min' => 0),
				'ref_client'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'datep'             => $rawEntry,
				'fin_validite'      => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'PUT:proposal/{id}' => array(
				'id'                => array('type' => $TYPE_INT, 'min' => 1),
				'ref_client'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'datep'             => $rawEntry,
				'fin_validite'      => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'POST:proposal/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:proposal/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:proposal/{id}/classifybilled' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:proposal/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:proposal/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:proposal/{id}/contact' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'contact_id' => array('type' => $TYPE_INT, 'min' => 1), 'type_id' => array('type' => $TYPE_INT, 'min' => 1), 'source' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:proposal/{id}/contact/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:proposal/{id}/links' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:proposal/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			// PDF generation: model + display flags are all optional;
			// the controller falls back to the configured default model.
			'POST:proposal/{id}/pdf' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'model'       => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'lang'        => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'hideref'     => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedesc'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedetails' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'POST:proposal/{id}/closesign' => array(
				'id'   => array('type' => $TYPE_INT, 'min' => 1),
				'note' => $rawEntry,
			),
			'POST:proposal/{id}/closeunsign' => array(
				'id'   => array('type' => $TYPE_INT, 'min' => 1),
				'note' => $rawEntry,
			),
			// Send proposal by email (PDF as attachment). Cf SendEmailTrait.
			'POST:proposal/{id}/send' => $sendEmailSchema,
			'POST:proposal/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11 sub-totals + titles). product_type=9
				// + special_code=0 -> title bar, product_type=9 +
				// special_code=104 -> sub-total bar (community 'linesubtotal'
				// convention). qty/subprice/tva_tx stay at 0 for sections.
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:proposal/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11). See POST schema above for codes.
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),

			'POST:order' => array(
				'socid'             => array('type' => $TYPE_INT, 'min' => 1),
				'fk_soc'            => array('type' => $TYPE_INT, 'min' => 0),
				'ref_client'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'date_commande'     => $rawEntry,
				'date_livraison'    => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'PUT:order/{id}' => array(
				'id'                => array('type' => $TYPE_INT, 'min' => 1),
				'ref_client'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'date_commande'     => $rawEntry,
				'date_livraison'    => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'POST:order/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/classifybilled' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/close' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/cancel' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:order/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/contact' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'contact_id' => array('type' => $TYPE_INT, 'min' => 1), 'type_id' => array('type' => $TYPE_INT, 'min' => 1), 'source' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:order/{id}/contact/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:order/{id}/links' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:order/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:order/{id}/pdf' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'model'       => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'lang'        => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'hideref'     => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedesc'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedetails' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'POST:order/createfromproposal/{proposalid}' => array('proposalid' => array('type' => $TYPE_INT, 'min' => 1)),
			// Send customer order by email (PDF as attachment).
			'POST:order/{id}/send' => $sendEmailSchema,
			'POST:order/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11 sub-totals + titles). See proposal schema.
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:order/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),

			'POST:invoice' => array(
				'socid'              => array('type' => $TYPE_INT, 'min' => 1),
				'fk_soc'             => array('type' => $TYPE_INT, 'min' => 0),
				'type'               => array('type' => $TYPE_INT, 'min' => 0),
				'ref_client'         => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'datef'              => $rawEntry,
				'date_lim_reglement' => $rawEntry,
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'fk_cond_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'          => $rawEntry,
			),
			'PUT:invoice/{id}' => array(
				'id'                 => array('type' => $TYPE_INT, 'min' => 1),
				'ref_client'         => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'datef'              => $rawEntry,
				'date_lim_reglement' => $rawEntry,
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'fk_cond_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'          => $rawEntry,
			),
			'POST:invoice/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/setpaid' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'close_code' => array('type' => $TYPE_STRING, 'maxLen' => 32), 'close_note' => $rawEntry),
			'POST:invoice/{id}/setunpaid' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/setcanceled' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'close_code' => array('type' => $TYPE_STRING, 'maxLen' => 32), 'close_note' => $rawEntry),
			'POST:invoice/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:invoice/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/contact' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'contact_id' => array('type' => $TYPE_INT, 'min' => 1), 'type_id' => array('type' => $TYPE_INT, 'min' => 1), 'source' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:invoice/{id}/contact/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:invoice/{id}/links' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:invoice/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:invoice/{id}/creditnotes' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/creditnote' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Tier A - A5c - reusable discounts (DiscountAbsolute).
			'POST:invoice/{id}/converttoreduc' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:invoice/{id}/discounts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/discount' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'discount_id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/usecreditnote' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'discount_id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:invoice/{id}/discount/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoice/{id}/pdf' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'model'       => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'lang'        => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'hideref'     => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedesc'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedetails' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'POST:invoice/createfromorder/{orderid}' => array('orderid' => array('type' => $TYPE_INT, 'min' => 1)),
			// Tier A - A5a - deposit invoices.
			'GET:invoice/deposit-terms' => array(),
			'POST:invoice/deposit' => array(
				'origin_type'       => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'origin_id'         => array('type' => $TYPE_INT, 'min' => 1),
				'cond_reglement_id' => array('type' => $TYPE_INT, 'min' => 1),
				'deposit_percent'   => array('type' => $TYPE_FLOAT, 'min' => 0),
				'date'              => $rawEntry,
			),

			// =====================================================================
			// Tier A - A5b - Recurring invoice templates (FactureRec)
			// =====================================================================

			'GET:invoicerec'          => $listSchema,
			'GET:invoicerec/columns'  => $columnsSchema,
			'GET:invoicerec/describe' => $columnsSchema,
			'GET:invoicerec/count'    => $countSchema,
			'POST:invoicerec' => array(
				'fk_facture'     => array('type' => $TYPE_INT, 'min' => 1),
				'title'          => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'frequency'      => array('type' => $TYPE_INT, 'min' => 0),
				'unit_frequency' => array('type' => $TYPE_STRING, 'maxLen' => 2),
				'date_when'      => $rawEntry,
				'nb_gen_max'     => array('type' => $TYPE_INT, 'min' => 0),
				'auto_validate'  => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usenewprice'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'PUT:invoicerec/{id}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'title'          => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'frequency'      => array('type' => $TYPE_INT, 'min' => 0),
				'unit_frequency' => array('type' => $TYPE_STRING, 'maxLen' => 2),
				'date_when'      => $rawEntry,
				'nb_gen_max'     => array('type' => $TYPE_INT, 'min' => 0),
				'auto_validate'  => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'usenewprice'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'note_public'    => $rawEntry,
				'note_private'   => $rawEntry,
			),
			'POST:invoicerec/{id}/generate'  => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoicerec/{id}/suspend'   => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:invoicerec/{id}/unsuspend' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			// Send customer invoice by email (PDF as attachment).
			'POST:invoice/{id}/send' => $sendEmailSchema,
			// Record a payment against a customer invoice.
			'POST:invoice/{id}/payment' => $paymentSchema,
			'POST:invoice/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11 sub-totals + titles).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:invoice/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),

			// =====================================================================
			// Lot 4 - Cycle achat (Commandes + Factures fournisseur)
			// =====================================================================

			'POST:supplierorder' => array(
				'socid'             => array('type' => $TYPE_INT, 'min' => 1),
				'ref_supplier'      => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'date_commande'     => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'date_livraison'    => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'lines'             => array('type' => $TYPE_ARRAY, 'itemType' => $TYPE_RAW),
			),
			'PUT:supplierorder/{id}' => array(
				'id'                => array('type' => $TYPE_INT, 'min' => 1),
				'socid'             => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'      => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'date_commande'     => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'date_livraison'    => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
			),
			'POST:supplierorder/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierorder/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierorder/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:supplierorder/{id}/contacts' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierorder/{id}/contact' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'contact_id' => array('type' => $TYPE_INT, 'min' => 1), 'type_id' => array('type' => $TYPE_INT, 'min' => 1), 'source' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:supplierorder/{id}/contact/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:supplierorder/{id}/links' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:supplierorder/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierorder/{id}/pdf' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'model'       => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'lang'        => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'hideref'     => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedesc'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedetails' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'POST:supplierorder/{id}/approve'  => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierorder/{id}/order' => array(
				'id'      => array('type' => $TYPE_INT, 'min' => 1),
				'date'    => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'methode' => array('type' => $TYPE_INT, 'min' => 0),
				'comment' => $rawEntry,
			),
			'POST:supplierorder/{id}/receive' => array(
				'id'      => array('type' => $TYPE_INT, 'min' => 1),
				'date'    => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'type'    => array('type' => $TYPE_STRING, 'maxLen' => 8),
				'comment' => $rawEntry,
			),
			// Send supplier order by email (PDF as attachment).
			'POST:supplierorder/{id}/send' => $sendEmailSchema,
			'POST:supplierorder/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11 sub-totals + titles).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:supplierorder/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor).
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
			),

			'POST:supplierinvoice' => array(
				'socid'              => array('type' => $TYPE_INT, 'min' => 1),
				'ref_supplier'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'type'               => array('type' => $TYPE_INT, 'min' => 0),
				'libelle'            => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'datef'              => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'date_lim_reglement' => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'fk_cond_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'lines'              => array('type' => $TYPE_ARRAY, 'itemType' => $TYPE_RAW),
			),
			'PUT:supplierinvoice/{id}' => array(
				'id'                 => array('type' => $TYPE_INT, 'min' => 1),
				'socid'              => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'type'               => array('type' => $TYPE_INT, 'min' => 0),
				'libelle'            => array('type' => $TYPE_STRING, 'maxLen' => 255),
				'datef'              => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'date_lim_reglement' => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'fk_cond_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement'  => array('type' => $TYPE_INT, 'min' => 0),
			),
			'POST:supplierinvoice/{id}/validate'             => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/setdraft'             => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/setpaid'              => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'close_code' => array('type' => $TYPE_STRING, 'maxLen' => 32), 'close_note' => $rawEntry),
			'POST:supplierinvoice/{id}/setunpaid'            => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/clone'                => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:supplierinvoice/{id}/contacts'              => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/contact'              => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'contact_id' => array('type' => $TYPE_INT, 'min' => 1), 'type_id' => array('type' => $TYPE_INT, 'min' => 1), 'source' => array('type' => $TYPE_STRING, 'maxLen' => 16)),
			'DELETE:supplierinvoice/{id}/contact/{rowid}'    => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:supplierinvoice/{id}/links'                 => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:supplierinvoice/{id}/link/{rowid}'       => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/pdf' => array(
				'id'          => array('type' => $TYPE_INT, 'min' => 1),
				'model'       => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'lang'        => array('type' => $TYPE_STRING, 'maxLen' => 16),
				'hideref'     => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedesc'    => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'hidedetails' => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
			),
			'POST:supplierinvoice/createfromorder/{orderid}' => array('orderid' => array('type' => $TYPE_INT, 'min' => 1)),
			// Send supplier invoice by email (PDF as attachment).
			'POST:supplierinvoice/{id}/send' => $sendEmailSchema,
			// Record a payment against a supplier invoice.
			'POST:supplierinvoice/{id}/payment' => $paymentSchema,
			'POST:supplierinvoice/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11 sub-totals + titles).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:supplierinvoice/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'rang'           => array('type' => $TYPE_INT),
				// Section lines (Lot 11).
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				// Service-line metadata (Lot 9 lines editor). Dates are
				// accepted in seconds OR milliseconds (frontend
				// Date.getTime()), normalised by PaginatedListTrait.
				'date_start'     => array('type' => $TYPE_INT),
				'date_end'       => array('type' => $TYPE_INT),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),

			// =====================================================================
			// Lot 5 - Agenda (ActionComm)
			// =====================================================================

			// Catalog endpoints (Lot 6 v2 + Lot 9 generalisation to AgendaEvent).
			'GET:event/columns'  => $columnsSchema,
			'GET:event/describe' => $columnsSchema,
			'GET:event/filter-options' => $columnsSchema,
			'GET:event/counts' => $columnsSchema,

			'POST:event' => array(
				'label'            => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'type_code'        => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'datep'            => array('type' => $TYPE_INT, 'min' => 0),
				'datef'            => array('type' => $TYPE_INT, 'min' => 0),
				'fulldayevent'     => array('type' => $TYPE_BOOL),
				'location'         => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'note'             => $rawEntry,
				'percentage'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 100),
				'fk_user_assigned' => array('type' => $TYPE_INT, 'min' => 0),
				'socid'            => array('type' => $TYPE_INT, 'min' => 0),
				'fk_contact'       => array('type' => $TYPE_INT, 'min' => 0),
				'fk_element'       => array('type' => $TYPE_INT, 'min' => 0),
				'elementtype'      => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'priority'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 9),
				'fk_project'       => array('type' => $TYPE_INT, 'min' => 0),
				'status'           => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:event/{id}' => array(
				'id'               => array('type' => $TYPE_INT, 'min' => 0),
				'label'            => array('type' => $TYPE_STRING, 'maxLen' => 200),
				'type_code'        => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'datep'            => array('type' => $TYPE_INT, 'min' => 0),
				'datef'            => array('type' => $TYPE_INT, 'min' => 0),
				'fulldayevent'     => array('type' => $TYPE_BOOL),
				'location'         => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'note'             => $rawEntry,
				'percentage'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 100),
				'fk_user_assigned' => array('type' => $TYPE_INT, 'min' => 0),
				'socid'            => array('type' => $TYPE_INT, 'min' => 0),
				'fk_contact'       => array('type' => $TYPE_INT, 'min' => 0),
				'fk_element'       => array('type' => $TYPE_INT, 'min' => 0),
				'elementtype'      => array('type' => $TYPE_STRING, 'maxLen' => 64),
				'priority'         => array('type' => $TYPE_INT, 'min' => 0, 'max' => 9),
				'fk_project'       => array('type' => $TYPE_INT, 'min' => 0),
				'status'           => array('type' => $TYPE_INT, 'min' => 0),
			),
			'POST:event/{id}/done' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),

			// =====================================================================
			// Lot 5 - Document attachment (consume staged uploads)
			// =====================================================================

			'POST:document/attach' => array(
				'upload_id'   => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'object_type' => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'object_id'   => array('type' => $TYPE_INT, 'min' => 1),
				'filename'    => array('type' => $TYPE_STRING, 'maxLen' => 200),
			),

			// Task 4 - list documents attached to a Dolibarr object and
			// download an ECM-indexed file by its rowid. The list endpoint
			// accepts both camelCase (objectType/objectId) and snake_case
			// (object_type/object_id) parameter shapes; both are validated
			// the same way and the controller picks whichever is present.
			'GET:document' => array(
				'objectType'  => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'objectId'    => array('type' => $TYPE_INT, 'min' => 1),
				'object_type' => array('type' => $TYPE_STRING, 'maxLen' => 32),
				'object_id'   => array('type' => $TYPE_INT, 'min' => 1),
			),
			'GET:document/{id}/download' => array(
				'id' => array('type' => $TYPE_INT, 'min' => 1),
			),

			// =====================================================================
			// Tier A - A1 - Customer shipments (Expedition)
			// =====================================================================

			'GET:shipment'              => $listSchema,
			'GET:shipment/columns'      => $columnsSchema,
			'GET:shipment/lines/columns' => $columnsSchema,
			'GET:shipment/describe'     => $columnsSchema,
			'GET:shipment/count'        => $countSchema,
			// Create a shipment from a validated order. 'lines' is an array of
			// {entrepot_id, fk_origin_line, qty} -- typed RAW per item so the
			// generic sanitizer does not re-index / truncate it. Dates accept
			// seconds OR milliseconds (RAW, normalised server-side).
			'POST:shipment' => array(
				'origin_id'          => array('type' => $TYPE_INT, 'min' => 1),
				'date_delivery'      => $rawEntry,
				'tracking_number'    => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'shipping_method_id' => array('type' => $TYPE_INT, 'min' => 0),
				'ref_customer'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'lines'              => array('type' => $TYPE_ARRAY, 'itemType' => $TYPE_RAW),
			),
			'PUT:shipment/{id}' => array(
				'id'                 => array('type' => $TYPE_INT, 'min' => 1),
				'ref_customer'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'tracking_number'    => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'shipping_method_id' => array('type' => $TYPE_INT, 'min' => 0),
				'date_delivery'      => $rawEntry,
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
			),
			'POST:shipment/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:shipment/{id}/close'    => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:shipment/{id}/reopen'   => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:shipment/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:shipment/{id}/cancel'   => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:shipment/{id}/links'     => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:shipment/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),

			// =====================================================================
			// Tier A - A2 - Supplier receptions (Reception)
			// =====================================================================

			'GET:reception'              => $listSchema,
			'GET:reception/columns'      => $columnsSchema,
			'GET:reception/lines/columns' => $columnsSchema,
			'GET:reception/describe'     => $columnsSchema,
			'GET:reception/count'        => $countSchema,
			// Create a reception from a supplier order. 'lines' is an array of
			// {entrepot_id, fk_commandefourndet, qty, cost_price?, batch?,
			// eatby?, sellby?, comment?} -- typed RAW per item so the generic
			// sanitizer does not re-index / truncate it. Dates accept seconds OR
			// milliseconds (RAW, normalised server-side).
			'POST:reception' => array(
				'origin_id'          => array('type' => $TYPE_INT, 'min' => 1),
				'date_delivery'      => $rawEntry,
				'tracking_number'    => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'shipping_method_id' => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
				'lines'              => array('type' => $TYPE_ARRAY, 'itemType' => $TYPE_RAW),
			),
			'PUT:reception/{id}' => array(
				'id'                 => array('type' => $TYPE_INT, 'min' => 1),
				'ref_supplier'       => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'tracking_number'    => array('type' => $TYPE_STRING, 'maxLen' => 128),
				'shipping_method_id' => array('type' => $TYPE_INT, 'min' => 0),
				'date_delivery'      => $rawEntry,
				'note_public'        => $rawEntry,
				'note_private'       => $rawEntry,
			),
			'POST:reception/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:reception/{id}/close'    => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:reception/{id}/reopen'   => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:reception/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:reception/{id}/links'     => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:reception/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),

			// =====================================================================
			// Tier A - A3 - Supplier price requests (SupplierProposal)
			// =====================================================================

			'GET:supplierproposal'               => $listSchema,
			'GET:supplierproposal/columns'       => $columnsSchema,
			'GET:supplierproposal/lines/columns' => $columnsSchema,
			'GET:supplierproposal/describe'      => $columnsSchema,
			'GET:supplierproposal/count'         => $countSchema,
			'DELETE:supplierproposal'            => $bulkDeleteSchema,
			'POST:supplierproposal' => array(
				'socid'             => array('type' => $TYPE_INT, 'min' => 1),
				'fk_soc'            => array('type' => $TYPE_INT, 'min' => 0),
				'delivery_date'     => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'PUT:supplierproposal/{id}' => array(
				'id'                => array('type' => $TYPE_INT, 'min' => 1),
				'delivery_date'     => $rawEntry,
				'note_public'       => $rawEntry,
				'note_private'      => $rawEntry,
				'fk_cond_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'fk_mode_reglement' => array('type' => $TYPE_INT, 'min' => 0),
				'options_*'         => $rawEntry,
			),
			'POST:supplierproposal/{id}/validate' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierproposal/{id}/setdraft' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierproposal/{id}/closesign' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'note' => $rawEntry),
			'POST:supplierproposal/{id}/closeunsign' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'note' => $rawEntry),
			'POST:supplierproposal/{id}/reopen' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierproposal/{id}/clone' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'GET:supplierproposal/{id}/links' => array('id' => array('type' => $TYPE_INT, 'min' => 1)),
			'DELETE:supplierproposal/{id}/link/{rowid}' => array('id' => array('type' => $TYPE_INT, 'min' => 1), 'rowid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierproposal/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
			'PUT:supplierproposal/{id}/line/{lineid}' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'lineid'         => array('type' => $TYPE_INT, 'min' => 1),
				'label'          => array('type' => $TYPE_STRING, 'maxLen' => 250),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
				'special_code'   => array('type' => $TYPE_INT, 'min' => 0),
				'fk_unit'        => array('type' => $TYPE_INT, 'min' => 0),
			),
		);

		return 0;
	}
}
