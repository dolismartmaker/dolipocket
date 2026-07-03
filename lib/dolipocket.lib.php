<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * \file    dolipocket/lib/dolipocket.lib.php
 * \ingroup dolipocket
 * \brief   Library files with common functions for Dolipocket
 */

/**
 * Prepare admin pages header
 *
 * @return array
 */
function dolipocketAdminPrepareHead()
{
	global $langs, $conf;

	// global $db;
	// $extrafields = new ExtraFields($db);
	// $extrafields->fetch_name_optionals_label('myobject');

	$langs->load("dolipocket@dolipocket");

	$h = 0;
	$head = array();

	$head[$h][0] = dol_buildpath("/dolipocket/admin/setup.php", 1);
	$head[$h][1] = $langs->trans("Settings");
	$head[$h][2] = 'settings';
	$h++;

	/*
	$head[$h][0] = dol_buildpath("/dolipocket/admin/myobject_extrafields.php", 1);
	$head[$h][1] = $langs->trans("ExtraFields");
	$nbExtrafields = is_countable($extrafields->attributes['myobject']['label']) ? count($extrafields->attributes['myobject']['label']) : 0;
	if ($nbExtrafields > 0) {
		$head[$h][1] .= ' <span class="badge">' . $nbExtrafields . '</span>';
	}
	$head[$h][2] = 'myobject_extrafields';
	$h++;
	*/

	$head[$h][0] = dol_buildpath("/dolipocket/admin/about.php", 1);
	$head[$h][1] = $langs->trans("About");
	$head[$h][2] = 'about';
	$h++;

	// Show more tabs from modules
	// Entries must be declared in modules descriptor with line
	//$this->tabs = array(
	//	'entity:+tabname:Title:@dolipocket:/dolipocket/mypage.php?id=__ID__'
	//); // to add new tab
	//$this->tabs = array(
	//	'entity:-tabname:Title:@dolipocket:/dolipocket/mypage.php?id=__ID__'
	//); // to remove a tab
	complete_head_from_modules($conf, $langs, null, $head, $h, 'dolipocket@dolipocket');

	complete_head_from_modules($conf, $langs, null, $head, $h, 'dolipocket@dolipocket', 'remove');

	return $head;
}

use eftec\bladeone\BladeOne;

/**
 * Render a Blade view and exit.
 *
 * @param   string  $view     View name (e.g. 'auth.login')
 * @param   array   $content  Variables exposed to the view
 * @return  void
 */
function dpk_render($view, array $content = array())
{
	$cacheDir = DOL_DATA_ROOT . '/dolipocket/cache/';
	if (!is_dir($cacheDir)) {
		dol_mkdir($cacheDir);
	}
	$blade = new BladeOne(
		[dol_buildpath('/dolipocket/resources/views')],
		$cacheDir,
		BladeOne::MODE_AUTO
	);
	dol_syslog("DPK render view $view");
	echo $blade->run($view, $content);
	exit;
}

/**
 * Build the standard content array passed to every view.
 *
 * @param   array   $data    Route data
 * @param   string  $title   Page title
 * @return  array
 */
function dpk_content(array $data, $title = 'Dolipocket')
{
	global $langs, $conf;
	return [
		'data'   => $data,
		'title'  => $title,
		'lang'   => $langs->defaultlang,
		'entity' => (int) $conf->entity,
		'auth'   => [
			'login'  => $_SESSION['auth_login'] ?? '',
			'userid' => (int) ($_SESSION['auth_userid'] ?? 0),
			'entity' => (int) ($_SESSION['entity'] ?? 0),
		],
		'csrf'   => $_SESSION['token'] ?? '',
	];
}

/**
 * Lookup a Dolibarr user by login regardless of entity.
 * Login is unique cross-entity in Dolipocket.
 *
 * @param   string  $login   User login
 * @return  array|null       Row [rowid, entity, pass_crypted, statut] or null
 */
function dpk_findUserByLogin($login)
{
	global $db;
	if (empty($login)) {
		return null;
	}
	$sql = "SELECT rowid, entity, pass_crypted, statut FROM " . MAIN_DB_PREFIX . "user";
	$sql .= " WHERE login = '" . $db->escape($login) . "'";
	$sql .= " LIMIT 1";
	$resql = $db->query($sql);
	if (!$resql) {
		dol_syslog('DPK dpk_findUserByLogin: SQL error ' . $db->lasterror(), LOG_ERR);
		return null;
	}
	if ($db->num_rows($resql) == 0) {
		return null;
	}
	$obj = $db->fetch_object($resql);
	return [
		'rowid'        => (int) $obj->rowid,
		'entity'       => (int) $obj->entity,
		'pass_crypted' => $obj->pass_crypted,
		'statut'       => (int) $obj->statut,
	];
}

/**
 * Minimum SmartAuth version required by Dolipocket.
 *
 * Single source of truth used by both the activation-time check in
 * modDolipocket::init() and the backoffice banner. Dolipocket leans on
 * SmartAuth for the auth bridge (generateTokenForAuthenticatedUser), the
 * smartmaker validation-schema hook, the binary upload flow AND the generic
 * FK -> label resolution (thirdparty name in lists/detail, dmTrait
 * $listOfForeignKeyLabels) shipped in 2.0.31.
 *
 * @return string Semver string (e.g. '2.0.31')
 */
function dolipocket_required_smartauth_version()
{
	return '2.0.31';
}

/**
 * Read the installed SmartAuth module version from its descriptor.
 *
 * @return string|null Installed version, or null when the smartauth descriptor
 *                     is missing / unreadable / fails to instantiate.
 */
function dolipocket_get_installed_smartauth_version()
{
	$descriptorPath = function_exists('dol_buildpath')
		? dol_buildpath('/smartauth/core/modules/modSmartauth.class.php')
		: '';
	if ($descriptorPath === '' || !@is_readable($descriptorPath)) {
		return null;
	}
	require_once $descriptorPath;
	if (!class_exists('modSmartauth')) {
		return null;
	}
	global $db;
	try {
		$mod = new \modSmartauth($db);
		if (isset($mod->version) && is_string($mod->version)) {
			return $mod->version;
		}
	} catch (\Throwable $e) {
		dol_syslog("DPK dolipocket_get_installed_smartauth_version: " . $e->getMessage(), LOG_WARNING);
	}
	return null;
}

/**
 * Render a top-of-page banner when the installed SmartAuth module is missing
 * or older than the minimum version required by Dolipocket.
 *
 * Returns the HTML banner string when an upgrade is needed, or an empty string
 * when SmartAuth is OK. Designed to be inlined verbatim by every admin page:
 *
 *   print dolipocket_check_smartauth_version();
 *
 * @return string HTML or empty string
 */
function dolipocket_check_smartauth_version()
{
	$minVersion = dolipocket_required_smartauth_version();
	$dolistoreUrl = 'https://www.dolistore.com/product.php?id=2509';

	$installedVersion = dolipocket_get_installed_smartauth_version();

	if ($installedVersion !== null && version_compare($installedVersion, $minVersion, '>=')) {
		return '';
	}

	$installedLabel = $installedVersion !== null
		? 'version installée : ' . htmlspecialchars($installedVersion, ENT_QUOTES, 'UTF-8')
		: 'module non détecté';

	$linkLabel = 'Télécharger sur Dolistore';

	return '<div class="warning" style="margin:0 0 1em 0;padding:0.6em 0.8em;border:1px solid #cc9;background:#ffc;">'
		. 'Le module <strong>SmartAuth</strong> version <strong>' . htmlspecialchars($minVersion, ENT_QUOTES, 'UTF-8') . '</strong> ou plus récent est requis pour Dolipocket ('
		. $installedLabel . '). '
		. '<a href="' . htmlspecialchars($dolistoreUrl, ENT_QUOTES, 'UTF-8') . '" target="_blank" rel="noopener noreferrer">' . $linkLabel . '</a>'
		. '</div>';
}
