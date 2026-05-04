<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Web;

use Exception;

/**
 * Minimal HTTP router for Dolipocket public site (landing + auth flow).
 * Authenticated workspace runs in the PWA, not here.
 */
class RouteController
{
	/**
	 * Register a GET route.
	 *
	 * @param   string                       $targetAction  URI pattern
	 * @param   array|string|callable|null   $action        Controller action
	 * @param   bool                         $protected     Requires authentication
	 * @return  void
	 */
	public static function get($targetAction, $action = null, bool $protected = false)
	{
		self::route('GET', $targetAction, $action, $protected);
	}

	/**
	 * Register a POST route.
	 *
	 * @param   string                       $targetAction  URI pattern
	 * @param   array|string|callable|null   $action        Controller action
	 * @param   bool                         $protected     Requires authentication
	 * @return  void
	 */
	public static function post($targetAction, $action = null, bool $protected = false)
	{
		self::route('POST', $targetAction, $action, $protected);
	}

	/**
	 * Match the current request against a route and dispatch.
	 *
	 * @param   string                       $targetMethod  HTTP method
	 * @param   string                       $targetAction  URI pattern
	 * @param   array|string|callable|null   $action        Controller action
	 * @param   bool                         $protected     Requires authentication
	 * @return  void
	 */
	public static function route($targetMethod, $targetAction, $action = null, bool $protected = false)
	{
		global $db, $user;

		if (!is_array($action) || count($action) < 2) {
			return;
		}
		$targetClass = $action[0];
		$targetMethodName = $action[1];

		$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
		if ($method !== $targetMethod) {
			return;
		}

		$request_uri = $_SERVER['REQUEST_URI'] ?? '';
		if (strpos($request_uri, 'index.php') !== false) {
			$urlaction = parse_url(preg_replace('/.*index\.php\//', '', $request_uri), PHP_URL_PATH);
		} else {
			$urlaction = parse_url($request_uri, PHP_URL_PATH);
		}

		$match_action = str_replace('/', '\/', preg_replace("/{.*}/", '.*', $targetAction));
		if (!preg_match('/' . $match_action . '$/', (string) $urlaction)) {
			return;
		}

		dol_syslog("DPK Route match method=$method targetAction=$targetAction urlaction=$urlaction");

		// Collect data from request.
		$data = [];
		if ($method === 'POST') {
			foreach ($_POST as $key => $value) {
				$data[$key] = $value;
			}
		} else {
			foreach ($_GET as $key => $value) {
				$data[$key] = $value;
			}
		}

		// Extract URL placeholders {name}.
		if (strpos($targetAction, '{') !== false) {
			preg_match_all('/\{(\w+)\}/', $targetAction, $matches);
			$tags_names = $matches[1];
			$toremove = substr($targetAction, 0, strpos($targetAction, '{'));
			$str = str_replace('//', '/', str_replace($toremove, '/', (string) $urlaction));
			$tags_values = explode('/', $str);
			$i = 1;
			foreach ($tags_names as $key) {
				$data[$key] = $tags_values[$i] ?? '';
				$i++;
			}
		}

		// Auth check for protected routes (currently unused - reserved for future).
		if ($protected) {
			$login = $_SESSION['auth_login'] ?? '';
			$entity = (int) ($_SESSION['entity'] ?? 0);
			if (empty($login) || empty($entity)) {
				dol_syslog('DPK Route protected access denied, redirecting to /login', LOG_INFO);
				header('Location: /login');
				exit;
			}
			$_SESSION['token'] = newToken();
			$data['auth_login'] = $login;
			$data['auth_entity'] = $entity;
		}

		try {
			$class = new $targetClass();
			$class->$targetMethodName(['data' => $data, 'user' => $user]);
		} catch (Exception $e) {
			dol_syslog('DPK Route exception: ' . $e->getMessage(), LOG_ERR);
			http_response_code(500);
			print 'Internal error';
			exit;
		}
	}
}
