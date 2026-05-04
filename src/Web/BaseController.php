<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Web;

/**
 * Base controller for all Dolipocket public-site controllers.
 * Centralises session access, token handling, and PWA redirect.
 */
abstract class BaseController
{
	/** @var string Authenticated login (empty when anonymous) */
	protected $login;

	/** @var int Resolved entity for the current session */
	protected $entity;

	public function __construct()
	{
		$this->login  = $_SESSION['auth_login'] ?? '';
		$this->entity = (int) ($_SESSION['entity'] ?? 0);
	}

	/**
	 * Build the standard view payload.
	 *
	 * @param   array   $data    Route data
	 * @param   string  $title   Page title
	 * @return  array
	 */
	protected function content(array $data, string $title = 'Dolipocket'): array
	{
		return dpk_content($data, $title);
	}

	/**
	 * Refresh CSRF token in session.
	 *
	 * @return void
	 */
	protected function refreshToken(): void
	{
		$_SESSION['token'] = newToken();
	}

	/**
	 * Validate CSRF token from input.
	 *
	 * @param   array   $data  Request data
	 * @return  bool
	 */
	protected function validateToken(array $data): bool
	{
		$submitted = $data['token'] ?? '';
		$expected  = $_SESSION['token'] ?? '';
		if (empty($expected) || $submitted !== $expected) {
			dol_syslog('DPK CSRF token mismatch', LOG_WARNING);
			return false;
		}
		return true;
	}

	/**
	 * Redirect the browser to the PWA, passing freshly minted SmartAuth tokens.
	 * Tokens are passed in the URL fragment so they never reach the server logs/proxies.
	 *
	 * @param   string  $login         User login
	 * @param   int     $userId        Dolibarr user id
	 * @param   int     $entity        Tenant entity
	 * @param   string  $accessToken   SmartAuth access token (id|jwt)
	 * @param   string  $refreshToken  SmartAuth refresh token (id|jwt)
	 * @param   int     $expiresIn     Access token TTL in seconds
	 * @param   string  $deviceUuid    Device UUID seeded into SmartAuth salt2 (must be replayed via X-DEVICEID by the PWA)
	 * @return  void
	 */
	protected function redirectToPwa(string $login, int $userId, int $entity, string $accessToken, string $refreshToken, int $expiresIn, string $deviceUuid): void
	{
		$pwaUrl = rtrim(getDolGlobalString('DOLIPOCKET_PWA_URL', ''), '/');
		if ($pwaUrl === '') {
			$pwaUrl = '/dolipocket/pwa';
		}
		$fragment = http_build_query([
			'access_token'  => $accessToken,
			'refresh_token' => $refreshToken,
			'expires_in'    => $expiresIn,
			'login'         => $login,
			'userid'        => $userId,
			'entity'        => $entity,
			'device_uuid'   => $deviceUuid,
		]);
		$target = $pwaUrl . '/#/handoff?' . $fragment;
		dol_syslog("DPK redirect to PWA $pwaUrl for login=$login entity=$entity");
		header('Location: ' . $target);
		exit;
	}

	/**
	 * Redirect helper.
	 *
	 * @param   string  $path    Local path
	 * @return  void
	 */
	protected function redirect(string $path): void
	{
		header('Location: ' . $path);
		exit;
	}
}
