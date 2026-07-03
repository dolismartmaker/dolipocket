<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Tenant;

use DoliDB;
use RuntimeException;
use User;

/**
 * Provision a fresh Dolibarr entity for a new SaaS tenant.
 *
 * Steps:
 *   1. Allocate a new entity number (MAX(entity)+1, starting at 2).
 *   2. Insert minimal llx_const rows for the new entity (company name,
 *      default language, currency, mail sender, module activation).
 *   3. Create the admin user (login = email) bound to the new entity.
 *   4. Create per-entity document directory.
 *
 * Dolibarr llx_c_* dictionary tables (countries, currencies, payment terms...)
 * are global reference tables and do not need to be duplicated.
 */
class EntityProvisioner
{
	/** @var DoliDB */
	private $db;

	/**
	 * Dolibarr core module descriptor classes enabled for each new tenant.
	 *
	 * Declared by class name (not MAIN_MODULE_* constant) so the enabling
	 * constant is derived from the class -- MAIN_MODULE_<UPPER(name)> -- and
	 * cannot drift (the historical list carried a MAIN_MODULE_PROPAL typo
	 * instead of MAIN_MODULE_PROPALE). Covers the whole documented feature set
	 * (12 CRUD entities + the shipment/reception/supplier-proposal documents).
	 */
	private const MODULE_CLASSES = [
		'modSociete',
		'modProduct',
		'modService',
		'modPropale',
		'modCommande',
		'modFacture',
		'modFournisseur',
		'modBanque',
		'modTax',
		'modCategorie',
		'modAgenda',
		'modStock',
		'modExpedition',
		'modReception',
		'modSupplierProposal',
		'modProjet',
	];

	public function __construct(DoliDB $db)
	{
		$this->db = $db;
	}

	/**
	 * Provision a new tenant.
	 *
	 * @param   array  $params  Required keys:
	 *                          - email    (string) admin login
	 *                          - company  (string) company display name
	 *                          - password (string) plain text password
	 *                          - tenantId (int)    row in llx_dolipocket_tenant
	 * @return  array           ['entity' => int, 'userid' => int]
	 *
	 * @throws  RuntimeException on any failure (caller must rollback intent)
	 */
	public function provision(array $params): array
	{
		$email   = (string) ($params['email'] ?? '');
		$company = (string) ($params['company'] ?? '');
		$pass    = (string) ($params['password'] ?? '');
		if ($email === '' || $company === '' || $pass === '') {
			throw new RuntimeException('Missing required provisioning parameters');
		}

		$this->db->begin();

		try {
			$entity = $this->allocateEntity();
			dol_syslog("DPK provisioning: allocated entity=$entity for $email");

			$this->insertBaselineConstants($entity, $company, $email);
			$this->activateDefaultModules($entity);
			$userId = $this->createAdminUser($entity, $email, $pass);
			$this->grantAdminRights($entity, $userId);
			$this->createDocumentDirectory($entity);

			$this->db->commit();
			dol_syslog("DPK provisioning OK: entity=$entity userid=$userId");
			return ['entity' => $entity, 'userid' => $userId];
		} catch (\Throwable $e) {
			$this->db->rollback();
			dol_syslog('DPK provisioning rollback: ' . $e->getMessage(), LOG_ERR);
			throw new RuntimeException('Provisioning failed: ' . $e->getMessage(), 0, $e);
		}
	}

	/**
	 * Allocate a new entity number by scanning llx_user, llx_const and
	 * llx_dolipocket_tenant for the current max. Entity 1 is reserved for
	 * the SaaS operator itself.
	 *
	 * @return int
	 */
	private function allocateEntity(): int
	{
		$candidates = [];
		foreach ([MAIN_DB_PREFIX . 'user', MAIN_DB_PREFIX . 'const', MAIN_DB_PREFIX . 'dolipocket_tenant'] as $table) {
			$sql = "SELECT MAX(entity) AS m FROM " . $table;
			$resql = $this->db->query($sql);
			if ($resql) {
				$obj = $this->db->fetch_object($resql);
				$candidates[] = (int) ($obj->m ?? 0);
			}
		}
		$next = max($candidates) + 1;
		if ($next < 2) {
			$next = 2;
		}
		return $next;
	}

	/**
	 * Insert mandatory llx_const rows for the new entity.
	 *
	 * @param   int     $entity   Target entity
	 * @param   string  $company  Company name
	 * @param   string  $email    Admin email (also used as MAIL_FROM)
	 * @return  void
	 */
	private function insertBaselineConstants(int $entity, string $company, string $email): void
	{
		$rows = [
			['MAIN_INFO_SOCIETE_NOM',   $company],
			['MAIN_INFO_SOCIETE_COUNTRY', '1:FR:France'],
			['MAIN_LANG_DEFAULT',       'fr_FR'],
			['MAIN_MONNAIE',            'EUR'],
			['MAIN_MAIL_EMAIL_FROM',    $email],
			['MAIN_INFO_DEFAULTTVA',    '20'],
			['SOCIETE_CODECLIENT_ADDON',  'mod_codeclient_monkey'],
			['SOCIETE_CODEFOURNISSEUR_ADDON', 'mod_codefournisseur_monkey'],
			['FACTURE_ADDON',           'mod_facture_terre'],
			['COMMANDE_ADDON',          'mod_commande_marbre'],
			['PROPALE_ADDON',           'mod_propale_marbre'],
			['PRODUCT_CODEPRODUCT_ADDON', 'mod_codeproduct_leopard'],
			['PROJECT_ADDON',           'mod_project_simple'],
			['PROJECT_TASK_ADDON',      'mod_task_simple'],
		];

		foreach ($rows as [$name, $value]) {
			$this->upsertConst($name, $value, $entity);
		}
	}

	/**
	 * Insert MAIN_MODULE_* constants to enable default modules for the entity.
	 *
	 * @param   int  $entity  Target entity
	 * @return  void
	 */
	private function activateDefaultModules(int $entity): void
	{
		foreach (self::MODULE_CLASSES as $modClass) {
			$constName = 'MAIN_MODULE_' . strtoupper(substr($modClass, 3));
			$this->upsertConst($constName, '1', $entity);
		}
	}

	/**
	 * Insert or replace a row in llx_const for a given entity.
	 *
	 * @param   string  $name    Constant name
	 * @param   string  $value   Constant value
	 * @param   int     $entity  Entity
	 * @return  void
	 */
	private function upsertConst(string $name, string $value, int $entity): void
	{
		$sql = "DELETE FROM " . MAIN_DB_PREFIX . "const WHERE name = '" . $this->db->escape($name) . "' AND entity = " . $entity;
		if (!$this->db->query($sql)) {
			throw new RuntimeException('const delete failed: ' . $this->db->lasterror());
		}
		$sql = "INSERT INTO " . MAIN_DB_PREFIX . "const (name, value, type, visible, entity)"
			. " VALUES ('" . $this->db->escape($name) . "', '" . $this->db->escape($value) . "', 'chaine', 1, " . $entity . ")";
		if (!$this->db->query($sql)) {
			throw new RuntimeException('const insert failed: ' . $this->db->lasterror());
		}
	}

	/**
	 * Create the admin user for the new entity.
	 * Stores both the bcrypt hash (pass_crypted) and clears legacy plain field.
	 *
	 * @param   int     $entity  Target entity
	 * @param   string  $email   Admin login (= email)
	 * @param   string  $pass    Plain password
	 * @return  int              New user id
	 */
	private function createAdminUser(int $entity, string $email, string $pass): int
	{
		$hash = password_hash($pass, PASSWORD_DEFAULT);
		$now  = $this->db->idate(dol_now());

		$sql = "INSERT INTO " . MAIN_DB_PREFIX . "user"
			. " (entity, login, lastname, email, admin, statut, pass_crypted, datec, tms)"
			. " VALUES ("
			. $entity . ","
			. " '" . $this->db->escape($email) . "',"
			. " '" . $this->db->escape($email) . "',"
			. " '" . $this->db->escape($email) . "',"
			. " 1, 1,"
			. " '" . $this->db->escape($hash) . "',"
			. " '" . $now . "',"
			. " '" . $now . "'"
			. ")";
		if (!$this->db->query($sql)) {
			throw new RuntimeException('user insert failed: ' . $this->db->lasterror());
		}
		$userId = (int) $this->db->last_insert_id(MAIN_DB_PREFIX . 'user');
		if ($userId <= 0) {
			throw new RuntimeException('user insert returned no id');
		}

		// NB: admin=1 is NOT enough to use the feature APIs -- rights are granted
		// explicitly in grantAdminRights() (see there for the full rationale).
		return $userId;
	}

	/**
	 * Populate the module permission definitions for the tenant entity and grant
	 * every one of them to the tenant admin user.
	 *
	 * Why this is mandatory: the admin is created with admin=1, but in this
	 * Dolibarr version User::hasRight() has no admin short-circuit for a non
	 * entity-1 admin, and User::getrights() only loads permissions that exist in
	 * llx_rights_def / llx_user_rights for the user's entity. Enabling a module
	 * through its MAIN_MODULE_* constant does NOT create those rows. Without this
	 * step the freshly provisioned admin gets HTTP 403 on every feature endpoint.
	 *
	 * Each module descriptor's insert_permissions() writes the llx_rights_def
	 * rows for the entity (lightweight -- no menus/dictionaries). We pass
	 * reinitadminperms=0 so it only writes the definitions and NEVER grants other
	 * admin users (reinitadminperms=1 would grant every admin of every tenant --
	 * a cross-tenant leak). The admin is then granted for this entity only via
	 * addrights('allmodules').
	 *
	 * @param   int  $entity  Target entity
	 * @param   int  $userId  Admin user id created by createAdminUser()
	 * @return  void
	 */
	private function grantAdminRights(int $entity, int $userId): void
	{
		global $conf;

		$prevEntity = isset($conf->entity) ? $conf->entity : null;
		$conf->entity = $entity;

		foreach (self::MODULE_CLASSES as $modClass) {
			$file = DOL_DOCUMENT_ROOT . '/core/modules/' . $modClass . '.class.php';
			if (!is_file($file)) {
				dol_syslog('DPK provisioning: module class file missing: ' . $modClass, LOG_WARNING);
				continue;
			}
			require_once $file;
			if (!class_exists($modClass)) {
				dol_syslog('DPK provisioning: module class not found: ' . $modClass, LOG_WARNING);
				continue;
			}
			$mod = new $modClass($this->db);
			// reinitadminperms=0: only populate llx_rights_def for $entity, do NOT
			// touch other admin users (multi-tenant isolation).
			$mod->insert_permissions(0, $entity);
		}

		require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';
		$admin = new User($this->db);
		if ($admin->fetch($userId) > 0) {
			$admin->entity = $entity;
			// notrigger=1: no permission-change triggers during provisioning.
			$admin->addrights(0, 'allmodules', '', $entity, 1);
		} else {
			dol_syslog('DPK provisioning: could not fetch admin userid=' . $userId . ' to grant rights', LOG_ERR);
		}

		if ($prevEntity !== null) {
			$conf->entity = $prevEntity;
		}
	}

	/**
	 * Create the per-entity document directory expected by Dolibarr.
	 *
	 * @param   int  $entity  Target entity
	 * @return  void
	 */
	private function createDocumentDirectory(int $entity): void
	{
		global $conf;
		$base = rtrim((string) $conf->file->dol_data_root, '/') . '/' . $entity;
		if (!is_dir($base)) {
			if (!dol_mkdir($base)) {
				throw new RuntimeException('Unable to create data dir ' . $base);
			}
		}
		foreach (['facture', 'propale', 'commande', 'produit', 'societe', 'users'] as $sub) {
			$path = $base . '/' . $sub;
			if (!is_dir($path)) {
				dol_mkdir($path);
			}
		}
	}
}
