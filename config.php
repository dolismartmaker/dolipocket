<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
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

// Bootstrap Dolibarr environment by locating main.inc.php from various places.
$res = 0;
if (empty($res) && !empty($_SERVER['CONTEXT_DOCUMENT_ROOT'])) {
	$res = @include $_SERVER['CONTEXT_DOCUMENT_ROOT'] . '/main.inc.php';
}
if (empty($res)) {
	$tmp  = empty($_SERVER['SCRIPT_FILENAME']) ? '' : $_SERVER['SCRIPT_FILENAME'];
	$tmp2 = realpath(__FILE__);
	$i    = strlen($tmp) - 1;
	$j    = strlen($tmp2) - 1;
	while ($i > 0 && $j > 0 && isset($tmp[$i]) && isset($tmp2[$j]) && $tmp[$i] == $tmp2[$j]) {
		$i--;
		$j--;
	}
	if (empty($res) && $i > 0 && file_exists(substr($tmp, 0, ($i + 1)) . '/main.inc.php')) {
		$res = @include substr($tmp, 0, ($i + 1)) . '/main.inc.php';
	}
	if (empty($res) && $i > 0 && file_exists(dirname(substr($tmp, 0, ($i + 1))) . '/main.inc.php')) {
		$res = @include dirname(substr($tmp, 0, ($i + 1))) . '/main.inc.php';
	}
}
if (empty($res) && file_exists('../main.inc.php')) {
	$res = @include '../main.inc.php';
} elseif (empty($res) && file_exists('../../main.inc.php')) {
	$res = @include '../../main.inc.php';
} elseif (empty($res) && file_exists('../../../main.inc.php')) {
	$res = @include '../../../main.inc.php';
} elseif (empty($res) && file_exists('../../../../main.inc.php')) {
	$res = @include '../../../../main.inc.php';
} elseif (empty($res)) {
	die('Include of main fails');
}
