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

		$schemas['dolipocket'] = array(

			// =====================================================================
			// Home (dashboard, menu, permissions). No params today; declared
			// explicitly so SmartAuth's generic sanitizer is bypassed even if
			// the PWA appends a future query param.
			// =====================================================================
			'GET:home' => array(),

			// =====================================================================
			// Lot 1 - Tiers + Contacts
			// =====================================================================

			// DataTable list/count/columns/bulk-delete (cf docs/DATATABLE_SPEC.md).
			'GET:thirdparty'         => $listSchema,
			'GET:thirdparty/columns' => $columnsSchema,
			'GET:thirdparty/count'   => $countSchema,
			'DELETE:thirdparty'      => $bulkDeleteSchema,
			'GET:contact'            => $listSchema,
			'GET:contact/columns'    => $columnsSchema,
			'GET:contact/count'      => $countSchema,
			'DELETE:contact'         => $bulkDeleteSchema,

			// DataTable schemas for the 7 Tier-1 features (Lot 6 v2 generalisation).
			'GET:product'            => $listSchema,
			'GET:product/columns'    => $columnsSchema,
			'GET:product/count'      => $countSchema,
			'DELETE:product'         => $bulkDeleteSchema,
			'GET:warehouse'          => $listSchema,
			'GET:warehouse/columns'  => $columnsSchema,
			'GET:warehouse/count'    => $countSchema,
			'DELETE:warehouse'       => $bulkDeleteSchema,
			'GET:proposal'           => $listSchema,
			'GET:proposal/columns'   => $columnsSchema,
			'GET:proposal/count'     => $countSchema,
			'DELETE:proposal'        => $bulkDeleteSchema,
			'GET:order'              => $listSchema,
			'GET:order/columns'      => $columnsSchema,
			'GET:order/count'        => $countSchema,
			'DELETE:order'           => $bulkDeleteSchema,
			'GET:invoice'            => $listSchema,
			'GET:invoice/columns'    => $columnsSchema,
			'GET:invoice/count'      => $countSchema,
			'DELETE:invoice'         => $bulkDeleteSchema,
			'GET:supplierorder'             => $listSchema,
			'GET:supplierorder/columns'     => $columnsSchema,
			'GET:supplierorder/count'       => $countSchema,
			'DELETE:supplierorder'          => $bulkDeleteSchema,
			'GET:supplierinvoice'           => $listSchema,
			'GET:supplierinvoice/columns'   => $columnsSchema,
			'GET:supplierinvoice/count'     => $countSchema,
			'DELETE:supplierinvoice'        => $bulkDeleteSchema,

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
				'fax'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'        => array('type' => $TYPE_EMAIL),
				'statut'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'poste'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
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
				'fax'          => array('type' => $TYPE_STRING, 'maxLen' => 30),
				'email'        => array('type' => $TYPE_EMAIL),
				'statut'       => array('type' => $TYPE_INT, 'min' => 0, 'max' => 1),
				'poste'        => array('type' => $TYPE_STRING, 'maxLen' => 100),
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
			'POST:proposal/{id}/closesign' => array(
				'id'   => array('type' => $TYPE_INT, 'min' => 1),
				'note' => $rawEntry,
			),
			'POST:proposal/{id}/closeunsign' => array(
				'id'   => array('type' => $TYPE_INT, 'min' => 1),
				'note' => $rawEntry,
			),
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
			'POST:order/createfromproposal/{proposalid}' => array('proposalid' => array('type' => $TYPE_INT, 'min' => 1)),
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
			'POST:invoice/createfromorder/{orderid}' => array('orderid' => array('type' => $TYPE_INT, 'min' => 1)),
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
			'POST:supplierorder/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
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
			'POST:supplierinvoice/createfromorder/{orderid}' => array('orderid' => array('type' => $TYPE_INT, 'min' => 1)),
			'POST:supplierinvoice/{id}/line' => array(
				'id'             => array('type' => $TYPE_INT, 'min' => 1),
				'description'    => $rawEntry,
				'qty'            => array('type' => $TYPE_FLOAT, 'min' => 0),
				'subprice'       => array('type' => $TYPE_FLOAT),
				'tva_tx'         => array('type' => $TYPE_FLOAT, 'min' => 0),
				'fk_product'     => array('type' => $TYPE_INT, 'min' => 0),
				'ref_supplier'   => array('type' => $TYPE_STRING, 'maxLen' => 100),
				'remise_percent' => array('type' => $TYPE_FLOAT, 'min' => 0),
				'product_type'   => array('type' => $TYPE_INT, 'min' => 0),
				'rang'           => array('type' => $TYPE_INT),
			),
			'PUT:supplierinvoice/{id}/line/{lineid}' => array(
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
			),

			// =====================================================================
			// Lot 5 - Agenda (ActionComm)
			// =====================================================================

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
		);

		return 0;
	}
}
