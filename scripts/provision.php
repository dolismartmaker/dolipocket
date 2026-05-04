<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * CLI tenant provisioning helper.
 *
 * Usage:
 *   php scripts/provision.php <email> "<company>" <password>
 *
 * Creates a fresh entity, admin user, baseline constants and document dirs.
 * Useful for tests, demo seeding and operator-led onboarding.
 */

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "This script must be run from CLI.\n");
	exit(1);
}

if ($argc < 4) {
	fwrite(STDERR, "Usage: php scripts/provision.php <email> \"<company>\" <password>\n");
	exit(2);
}
$email   = $argv[1];
$company = $argv[2];
$pass    = $argv[3];

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $company === '' || strlen($pass) < 8) {
	fwrite(STDERR, "Invalid arguments. Email must be valid, company non-empty, password >= 8 chars.\n");
	exit(2);
}

if (!defined('NOREQUIRESOC')) {
	define('NOREQUIRESOC', '1');
}
if (!defined('NOREQUIREMENU')) {
	define('NOREQUIREMENU', '1');
}
if (!defined('NOLOGIN')) {
	define('NOLOGIN', '1');
}
if (!defined('NOSESSION')) {
	define('NOSESSION', '1');
}

require __DIR__ . '/../config.php';
require __DIR__ . '/../vendor/autoload.php';

use Dolipocket\Tenant\EntityProvisioner;

global $db;

// Persist a tenant row first so EntityProvisioner has an authoritative id.
$now = $db->idate(dol_now());
$emailEsc = $db->escape($email);
$companyEsc = $db->escape($company);

$check = $db->query("SELECT rowid FROM " . MAIN_DB_PREFIX . "dolipocket_tenant WHERE email = '$emailEsc' LIMIT 1");
if ($check && $db->num_rows($check) > 0) {
	fwrite(STDERR, "Tenant for $email already exists.\n");
	exit(3);
}

$insert = "INSERT INTO " . MAIN_DB_PREFIX . "dolipocket_tenant"
	. " (email, company, status, date_creation)"
	. " VALUES ('$emailEsc', '$companyEsc', 'pending_otp', '$now')";
if (!$db->query($insert)) {
	fwrite(STDERR, "Tenant insert failed: " . $db->lasterror() . "\n");
	exit(4);
}
$tenantId = (int) $db->last_insert_id(MAIN_DB_PREFIX . 'dolipocket_tenant');

try {
	$provisioner = new EntityProvisioner($db);
	$result = $provisioner->provision([
		'email'    => $email,
		'company'  => $company,
		'password' => $pass,
		'tenantId' => $tenantId,
	]);
} catch (\Throwable $e) {
	fwrite(STDERR, "Provisioning failed: " . $e->getMessage() . "\n");
	$db->query("DELETE FROM " . MAIN_DB_PREFIX . "dolipocket_tenant WHERE rowid = $tenantId");
	exit(5);
}

$update = "UPDATE " . MAIN_DB_PREFIX . "dolipocket_tenant SET"
	. " status = 'active',"
	. " entity = " . (int) $result['entity'] . ","
	. " fk_user_admin = " . (int) $result['userid'] . ","
	. " date_activation = '$now'"
	. " WHERE rowid = $tenantId";
if (!$db->query($update)) {
	fwrite(STDERR, "Tenant activation update failed: " . $db->lasterror() . "\n");
	exit(6);
}

printf(
	"Tenant provisioned: tenant=%d entity=%d user=%d email=%s\n",
	$tenantId,
	$result['entity'],
	$result['userid'],
	$email
);
exit(0);
