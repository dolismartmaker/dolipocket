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

/**
 * Resolve which Dolibarr entity a request belongs to on the public Blade site.
 *
 * Public site routes (landing, signup, login, password reset) only need the
 * session-bound entity that loginSubmit pins after credential verification.
 *
 * API requests are NOT resolved here: they go through the SmartAuth API
 * prepend, which decodes the JWT and sets $conf->entity from the token claim.
 */
class EntityResolver
{
	/** @var DoliDB */
	private $db;

	public function __construct(DoliDB $db)
	{
		$this->db = $db;
	}

	/**
	 * Resolve the entity for the current public-site request, or null if anonymous.
	 *
	 * @return int|null
	 */
	public function resolve(): ?int
	{
		if (!empty($_SESSION['entity'])) {
			return (int) $_SESSION['entity'];
		}
		return null;
	}
}
