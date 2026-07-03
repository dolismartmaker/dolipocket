<?php
/* Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

namespace Dolipocket\Web;

use Dolipocket\Tenant\EntityProvisioner;
use Exception;

/**
 * Public authentication flow:
 *   - signup with email OTP
 *   - login with password
 *   - password reset by email link
 *   - logout
 *
 * On successful login, SmartAuth mints an access/refresh token pair via
 * generateTokenForAuthenticatedUser() and the browser is redirected to the PWA
 * with those tokens in the URL fragment.
 */
class AuthController extends BaseController
{
	/* ----------------------------------------------------------------- */
	/* Signup flow                                                       */
	/* ----------------------------------------------------------------- */

	/**
	 * Show signup form.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function signup(array $inputdata): void
	{
		$this->refreshToken();
		$content = $this->content($inputdata['data'] ?? [], 'Créer un compte - Dolipocket');
		$content['error'] = $_SESSION['dpk_signup_error'] ?? '';
		unset($_SESSION['dpk_signup_error']);
		dpk_render('auth.signup', $content);
	}

	/**
	 * Process signup: create pending tenant row, send OTP by email.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function signupSubmit(array $inputdata): void
	{
		global $db;
		$data = $inputdata['data'] ?? [];

		if (!$this->validateToken($data)) {
			$_SESSION['dpk_signup_error'] = 'Session expirée, merci de recommencer.';
			$this->redirect('/signup');
		}

		$email   = trim((string) ($data['email'] ?? ''));
		$company = trim((string) ($data['company'] ?? ''));
		$accept  = !empty($data['accept_terms']);

		if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $company === '' || !$accept) {
			$_SESSION['dpk_signup_error'] = 'Merci de remplir email, nom de société et accepter les CGU.';
			$this->redirect('/signup');
		}

		// Reject duplicate email (already pending or already provisioned).
		$sql = "SELECT rowid FROM " . MAIN_DB_PREFIX . "dolipocket_tenant WHERE email = '" . $db->escape($email) . "' LIMIT 1";
		$resql = $db->query($sql);
		if ($resql && $db->num_rows($resql) > 0) {
			$_SESSION['dpk_signup_error'] = 'Cet email est déjà utilisé.';
			$this->redirect('/signup');
		}

		$otp     = sprintf('%06d', random_int(0, 999999));
		$otpHash = password_hash($otp, PASSWORD_DEFAULT);
		$now     = $db->idate(dol_now());

		$sql = "INSERT INTO " . MAIN_DB_PREFIX . "dolipocket_tenant"
			. " (email, company, otp_hash, otp_expires, status, date_creation)"
			. " VALUES ("
			. " '" . $db->escape($email) . "',"
			. " '" . $db->escape($company) . "',"
			. " '" . $db->escape($otpHash) . "',"
			. " '" . $db->idate(dol_now() + 900) . "',"
			. " 'pending_otp',"
			. " '" . $now . "'"
			. ")";
		if (!$db->query($sql)) {
			dol_syslog('DPK signup insert failed: ' . $db->lasterror(), LOG_ERR);
			$_SESSION['dpk_signup_error'] = 'Erreur technique, merci de réessayer.';
			$this->redirect('/signup');
		}

		$this->sendOtpMail($email, $otp);
		$_SESSION['dpk_signup_email'] = $email;
		$this->redirect('/signup/verify');
	}

	/**
	 * Show OTP verification form.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function verify(array $inputdata): void
	{
		$this->refreshToken();
		$email = $_SESSION['dpk_signup_email'] ?? '';
		if ($email === '') {
			$this->redirect('/signup');
		}
		$content = $this->content($inputdata['data'] ?? [], 'Confirmer votre email - Dolipocket');
		$content['email'] = $email;
		$content['error'] = $_SESSION['dpk_signup_error'] ?? '';
		unset($_SESSION['dpk_signup_error']);
		dpk_render('auth.verify', $content);
	}

	/**
	 * Process OTP verification: provision tenant entity, redirect to "done".
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function verifySubmit(array $inputdata): void
	{
		global $db;
		$data = $inputdata['data'] ?? [];

		if (!$this->validateToken($data)) {
			$_SESSION['dpk_signup_error'] = 'Session expirée.';
			$this->redirect('/signup/verify');
		}

		$email = $_SESSION['dpk_signup_email'] ?? '';
		$otp   = trim((string) ($data['otp'] ?? ''));
		$pass  = (string) ($data['password'] ?? '');

		if ($email === '' || $otp === '' || strlen($pass) < 8) {
			$_SESSION['dpk_signup_error'] = 'Code invalide ou mot de passe trop court (8 caractères minimum).';
			$this->redirect('/signup/verify');
		}

		$sql = "SELECT rowid, otp_hash, otp_expires, company, status FROM " . MAIN_DB_PREFIX . "dolipocket_tenant"
			. " WHERE email = '" . $db->escape($email) . "' LIMIT 1";
		$resql = $db->query($sql);
		if (!$resql || $db->num_rows($resql) == 0) {
			$_SESSION['dpk_signup_error'] = 'Demande introuvable.';
			$this->redirect('/signup');
		}
		$row = $db->fetch_object($resql);

		if ($row->status !== 'pending_otp') {
			$_SESSION['dpk_signup_error'] = 'Compte déjà activé. Merci de vous connecter.';
			$this->redirect('/login');
		}
		if (strtotime($row->otp_expires) < dol_now()) {
			dol_syslog("DPK verify: OTP expired for $email", LOG_INFO);
			$_SESSION['dpk_signup_error'] = 'Code expiré, merci de recommencer.';
			$this->redirect('/signup');
		}
		if (!password_verify($otp, $row->otp_hash)) {
			dol_syslog("DPK verify: bad OTP for $email", LOG_WARNING);
			$_SESSION['dpk_signup_error'] = 'Code incorrect.';
			$this->redirect('/signup/verify');
		}

		// Provision a fresh entity, admin user, baseline reference data.
		try {
			$provisioner = new EntityProvisioner($db);
			$result = $provisioner->provision([
				'email'    => $email,
				'company'  => $row->company,
				'password' => $pass,
				'tenantId' => (int) $row->rowid,
			]);
		} catch (Exception $e) {
			dol_syslog('DPK provisioning failed: ' . $e->getMessage(), LOG_ERR);
			$_SESSION['dpk_signup_error'] = 'Erreur lors de la création du compte. Notre équipe a été prévenue.';
			$this->redirect('/signup/verify');
		}

		$update = "UPDATE " . MAIN_DB_PREFIX . "dolipocket_tenant SET"
			. " status = 'active',"
			. " entity = " . (int) $result['entity'] . ","
			. " fk_user_admin = " . (int) $result['userid'] . ","
			. " otp_hash = NULL,"
			. " date_activation = '" . $db->idate(dol_now()) . "'"
			. " WHERE rowid = " . (int) $row->rowid;
		if (!$db->query($update)) {
			dol_syslog('DPK tenant activation update failed: ' . $db->lasterror(), LOG_ERR);
		}

		// Optionally seed a demo dataset for the fresh tenant. Operator opt-in
		// via the DOLIPOCKET_DEMO_ON_SIGNUP constant (off by default). Non-fatal:
		// signup must succeed even if seeding fails.
		if (getDolGlobalInt('DOLIPOCKET_DEMO_ON_SIGNUP')) {
			$this->seedDemoData($db, (int) $result['entity'], (int) $result['userid']);
		}

		unset($_SESSION['dpk_signup_email']);
		$this->redirect('/signup/done');
	}

	/**
	 * Seed the demo dataset into a freshly provisioned tenant entity.
	 *
	 * Switches $conf->entity to the new tenant, loads its admin user (already
	 * granted the module rights by EntityProvisioner) and runs the demo
	 * generator. Fully non-fatal and logged: any failure leaves signup
	 * unaffected. Restores the previous entity on the way out.
	 *
	 * @param   \DoliDB  $db      Database handler
	 * @param   int      $entity  Freshly provisioned entity
	 * @param   int      $userId  Tenant admin user id
	 * @return  void
	 */
	private function seedDemoData($db, int $entity, int $userId): void
	{
		global $conf;

		$prevEntity = isset($conf->entity) ? $conf->entity : null;
		try {
			dol_include_once('/dolipocket/class/demodata.class.php');
			require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';

			$conf->entity = $entity;
			$admin = new \User($db);
			if ($admin->fetch($userId) <= 0) {
				dol_syslog('DPK demo-on-signup: admin user not found (id ' . $userId . ')', LOG_ERR);
			} else {
				$admin->getrights();
				$demo = new \DolipocketDemoData($db);
				$out = $demo->generate($admin, true);
				dol_syslog('DPK demo-on-signup: entity=' . $entity . ' summary=' . $out['summary'] . ' warnings=' . $out['warnings'], LOG_INFO);
			}
		} catch (\Throwable $e) {
			dol_syslog('DPK demo-on-signup failed for entity ' . $entity . ': ' . $e->getMessage(), LOG_ERR);
		}
		if ($prevEntity !== null) {
			$conf->entity = $prevEntity;
		}
	}

	/**
	 * Show signup completion page (CTA to login + PWA install hint).
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function done(array $inputdata): void
	{
		$content = $this->content($inputdata['data'] ?? [], 'Compte créé - Dolipocket');
		dpk_render('auth.done', $content);
	}

	/* ----------------------------------------------------------------- */
	/* Login flow                                                        */
	/* ----------------------------------------------------------------- */

	/**
	 * Show login form.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function login(array $inputdata): void
	{
		$this->refreshToken();
		$content = $this->content($inputdata['data'] ?? [], 'Connexion - Dolipocket');
		$content['error'] = $_SESSION['dpk_login_error'] ?? '';
		unset($_SESSION['dpk_login_error']);
		dpk_render('auth.login', $content);
	}

	/**
	 * Process login: locate cross-entity user, verify password, hand off to PWA.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function loginSubmit(array $inputdata): void
	{
		$data = $inputdata['data'] ?? [];

		if (!$this->validateToken($data)) {
			$_SESSION['dpk_login_error'] = 'Session expirée.';
			$this->redirect('/login');
		}

		$login = trim((string) ($data['login'] ?? ''));
		$pass  = (string) ($data['password'] ?? '');

		if ($login === '' || $pass === '') {
			$_SESSION['dpk_login_error'] = 'Identifiants requis.';
			$this->redirect('/login');
		}

		$row = dpk_findUserByLogin($login);
		if ($row === null || $row['statut'] != 1) {
			dol_syslog("DPK login: unknown or disabled login=$login", LOG_INFO);
			$_SESSION['dpk_login_error'] = 'Identifiants invalides.';
			$this->redirect('/login');
		}
		if (!password_verify($pass, $row['pass_crypted'])) {
			dol_syslog("DPK login: bad password login=$login", LOG_INFO);
			$_SESSION['dpk_login_error'] = 'Identifiants invalides.';
			$this->redirect('/login');
		}

		// Pin entity context BEFORE loading the user so all entity-scoped reads use the right tenant.
		global $conf, $db;
		$conf->entity = $row['entity'];
		$_SESSION['auth_login']  = $login;
		$_SESSION['auth_userid'] = $row['rowid'];
		$_SESSION['entity']      = $row['entity'];
		$_SESSION['dol_entity']  = $row['entity'];

		// Load full Dolibarr user object required by SmartAuth.
		require_once DOL_DOCUMENT_ROOT . '/user/class/user.class.php';
		$user = new \User($db);
		if ($user->fetch($row['rowid']) <= 0) {
			dol_syslog('DPK login: User->fetch failed for id=' . $row['rowid'], LOG_ERR);
			$_SESSION['dpk_login_error'] = 'Erreur technique.';
			$this->redirect('/login');
		}

		// Mint a stable device UUID for this login: it is fed both to SmartAuth
		// (to seed salt2) and forwarded to the PWA which will pin it as deviceId.
		// Without this pinning, the PWA's own UUID would diverge from the salt2
		// computed at token generation time, breaking token validation.
		$deviceUuid = $this->generateUuidV4();

		// Mint SmartAuth access/refresh tokens for the PWA (no custom handoff anymore).
		dol_include_once('/smartauth/api/AuthController.php');
		try {
			$smartauth = new \SmartAuth\Api\AuthController();
			$tokens = $smartauth->generateTokenForAuthenticatedUser($user, (int) $row['entity'], 'Dolipocket Web', $deviceUuid);
		} catch (Exception $e) {
			dol_syslog('DPK login: SmartAuth generateTokenForAuthenticatedUser failed: ' . $e->getMessage(), LOG_ERR);
			$_SESSION['dpk_login_error'] = 'Erreur technique.';
			$this->redirect('/login');
		}

		$this->redirectToPwa(
			$login,
			(int) $user->id,
			(int) $row['entity'],
			$tokens['access_token'],
			$tokens['refresh_token'],
			(int) $tokens['expires_in'],
			$deviceUuid
		);
	}

	/**
	 * Logout: destroy session, return to landing.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function logout(array $inputdata): void
	{
		dol_syslog('DPK logout login=' . ($this->login ?: 'anon'));
		$_SESSION = [];
		if (ini_get('session.use_cookies')) {
			$params = session_get_cookie_params();
			setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
		}
		session_destroy();
		$this->redirect('/');
	}

	/* ----------------------------------------------------------------- */
	/* Password reset                                                    */
	/* ----------------------------------------------------------------- */

	/**
	 * Show "forgot password" form.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function forgot(array $inputdata): void
	{
		$this->refreshToken();
		$content = $this->content($inputdata['data'] ?? [], 'Mot de passe oublié - Dolipocket');
		$content['error'] = $_SESSION['dpk_forgot_error'] ?? '';
		$content['notice'] = $_SESSION['dpk_forgot_notice'] ?? '';
		unset($_SESSION['dpk_forgot_error'], $_SESSION['dpk_forgot_notice']);
		dpk_render('auth.forgot', $content);
	}

	/**
	 * Process forgot password: send reset email if account exists.
	 * Always responds with the same notice to avoid email enumeration.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function forgotSubmit(array $inputdata): void
	{
		global $db;
		$data = $inputdata['data'] ?? [];

		if (!$this->validateToken($data)) {
			$_SESSION['dpk_forgot_error'] = 'Session expirée.';
			$this->redirect('/forgot');
		}

		$email = trim((string) ($data['email'] ?? ''));
		if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
			$row = dpk_findUserByLogin($email);
			if ($row !== null && $row['statut'] == 1) {
				$token = bin2hex(random_bytes(32));
				$expires = $db->idate(dol_now() + 3600);
				$sql = "UPDATE " . MAIN_DB_PREFIX . "dolipocket_tenant SET"
					. " reset_token = '" . $db->escape($token) . "',"
					. " reset_expires = '" . $expires . "'"
					. " WHERE email = '" . $db->escape($email) . "'";
				if ($db->query($sql)) {
					$this->sendResetMail($email, $token);
				} else {
					dol_syslog('DPK forgot: failed to store reset token: ' . $db->lasterror(), LOG_ERR);
				}
			} else {
				dol_syslog("DPK forgot: no active account for $email (silent)", LOG_INFO);
			}
		}

		$_SESSION['dpk_forgot_notice'] = 'Si un compte existe pour cet email, un lien de réinitialisation vient de vous être envoyé.';
		$this->redirect('/forgot');
	}

	/**
	 * Show password reset form.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function reset(array $inputdata): void
	{
		$this->refreshToken();
		$token = (string) ($inputdata['data']['token'] ?? '');
		if ($token === '' || !$this->lookupResetToken($token)) {
			$this->redirect('/forgot');
		}
		$content = $this->content($inputdata['data'] ?? [], 'Nouveau mot de passe - Dolipocket');
		$content['token'] = $token;
		$content['error'] = $_SESSION['dpk_reset_error'] ?? '';
		unset($_SESSION['dpk_reset_error']);
		dpk_render('auth.reset', $content);
	}

	/**
	 * Apply password reset.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function resetSubmit(array $inputdata): void
	{
		global $db;
		$data = $inputdata['data'] ?? [];

		if (!$this->validateToken($data)) {
			$_SESSION['dpk_reset_error'] = 'Session expirée.';
			$this->redirect('/forgot');
		}

		$token = (string) ($data['token'] ?? '');
		$pass  = (string) ($data['password'] ?? '');
		if (strlen($pass) < 8) {
			$_SESSION['dpk_reset_error'] = 'Mot de passe trop court (8 caractères minimum).';
			$this->redirect('/reset/' . urlencode($token));
		}

		$row = $this->lookupResetToken($token);
		if ($row === null) {
			$this->redirect('/forgot');
		}

		$hash = password_hash($pass, PASSWORD_DEFAULT);
		$sql = "UPDATE " . MAIN_DB_PREFIX . "user SET"
			. " pass_crypted = '" . $db->escape($hash) . "',"
			. " pass = NULL"
			. " WHERE rowid = " . (int) $row['fk_user_admin'];
		if (!$db->query($sql)) {
			dol_syslog('DPK reset: password update failed: ' . $db->lasterror(), LOG_ERR);
			$_SESSION['dpk_reset_error'] = 'Erreur technique.';
			$this->redirect('/reset/' . urlencode($token));
		}

		$clear = "UPDATE " . MAIN_DB_PREFIX . "dolipocket_tenant SET"
			. " reset_token = NULL, reset_expires = NULL"
			. " WHERE rowid = " . (int) $row['rowid'];
		if (!$db->query($clear)) {
			dol_syslog('DPK reset: failed to clear token: ' . $db->lasterror(), LOG_ERR);
		}

		$this->redirect('/login');
	}

	/* ----------------------------------------------------------------- */
	/* Helpers                                                           */
	/* ----------------------------------------------------------------- */

	/**
	 * Lookup a non-expired reset token in the tenant table.
	 *
	 * @param   string  $token  Reset token
	 * @return  array|null      Tenant row or null if invalid/expired
	 */
	private function lookupResetToken(string $token): ?array
	{
		global $db;
		if ($token === '') {
			return null;
		}
		$sql = "SELECT rowid, fk_user_admin, reset_expires FROM " . MAIN_DB_PREFIX . "dolipocket_tenant"
			. " WHERE reset_token = '" . $db->escape($token) . "' LIMIT 1";
		$resql = $db->query($sql);
		if (!$resql || $db->num_rows($resql) == 0) {
			return null;
		}
		$obj = $db->fetch_object($resql);
		if (strtotime($obj->reset_expires) < dol_now()) {
			dol_syslog('DPK reset: token expired', LOG_INFO);
			return null;
		}
		return [
			'rowid'         => (int) $obj->rowid,
			'fk_user_admin' => (int) $obj->fk_user_admin,
		];
	}

	/**
	 * Generate a RFC 4122 v4 UUID. Used to seed device_uuid before SmartAuth
	 * token generation so the same value can be replayed by the PWA via X-DEVICEID.
	 *
	 * @return string
	 */
	private function generateUuidV4(): string
	{
		$bytes = random_bytes(16);
		$bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40);
		$bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80);
		$hex = bin2hex($bytes);
		return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
	}

	/**
	 * Send OTP code by email.
	 *
	 * @param   string  $email  Recipient
	 * @param   string  $otp    6-digit OTP
	 * @return  void
	 */
	private function sendOtpMail(string $email, string $otp): void
	{
		global $conf;
		$from = getDolGlobalString('MAIN_MAIL_EMAIL_FROM', 'no-reply@dolipocket.fr');
		$subject = 'Dolipocket - votre code de confirmation';
		$body = "Bonjour,\n\nVotre code de confirmation Dolipocket est : $otp\n\nCe code expire dans 15 minutes.\n";
		$cmail = new \CMailFile($subject, $email, $from, $body);
		if (!$cmail->sendfile()) {
			dol_syslog('DPK sendOtpMail failed: ' . $cmail->error, LOG_ERR);
		}
	}

	/**
	 * Send password reset link by email.
	 *
	 * @param   string  $email  Recipient
	 * @param   string  $token  Reset token
	 * @return  void
	 */
	private function sendResetMail(string $email, string $token): void
	{
		$from = getDolGlobalString('MAIN_MAIL_EMAIL_FROM', 'no-reply@dolipocket.fr');
		$base = rtrim(getDolGlobalString('DOLIPOCKET_PUBLIC_URL', ''), '/');
		if ($base === '') {
			$base = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
		}
		$link = $base . '/reset/' . urlencode($token);
		$subject = 'Dolipocket - réinitialisation de votre mot de passe';
		$body = "Bonjour,\n\nPour réinitialiser votre mot de passe Dolipocket, cliquez sur ce lien (valide 1 heure) :\n\n$link\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n";
		$cmail = new \CMailFile($subject, $email, $from, $body);
		if (!$cmail->sendfile()) {
			dol_syslog('DPK sendResetMail failed: ' . $cmail->error, LOG_ERR);
		}
	}
}
