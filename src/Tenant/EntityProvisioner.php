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

	/** @var array Modules activated by default for each new tenant */
	private const DEFAULT_MODULES = [
		'MAIN_MODULE_SOCIETE',
		'MAIN_MODULE_FACTURE',
		'MAIN_MODULE_PROPAL',
		'MAIN_MODULE_COMMANDE',
		'MAIN_MODULE_PRODUCT',
		'MAIN_MODULE_SERVICE',
		'MAIN_MODULE_BANQUE',
		'MAIN_MODULE_TAX',
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
		foreach (self::DEFAULT_MODULES as $constName) {
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

		// Grant the user every Dolipocket-relevant permission via a Dolibarr User object.
		// Loading the user re-reads from DB and respects entity scoping internally.
		require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';
		$user = new User($this->db);
		if ($user->fetch($userId) <= 0) {
			throw new RuntimeException('user fetch failed after insert');
		}
		// admin=1 grants all rights at runtime, no per-permission row needed.

		return $userId;
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
