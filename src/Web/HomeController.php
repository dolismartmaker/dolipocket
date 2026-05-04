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
 * Public landing pages: homepage, pricing, legal mentions, terms.
 * SEO-visible static content rendered with Blade.
 */
class HomeController extends BaseController
{
	/**
	 * Homepage / landing.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function index(array $inputdata): void
	{
		$content = $this->content($inputdata['data'] ?? [], 'Dolipocket - Dolibarr dans votre poche');
		dpk_render('home.index', $content);
	}

	/**
	 * Pricing page.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function pricing(array $inputdata): void
	{
		$content = $this->content($inputdata['data'] ?? [], 'Tarifs - Dolipocket');
		dpk_render('home.pricing', $content);
	}

	/**
	 * Legal notice.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function legal(array $inputdata): void
	{
		$content = $this->content($inputdata['data'] ?? [], 'Mentions légales - Dolipocket');
		dpk_render('home.legal', $content);
	}

	/**
	 * Terms of service.
	 *
	 * @param   array  $inputdata  Route data
	 * @return  void
	 */
	public function terms(array $inputdata): void
	{
		$content = $this->content($inputdata['data'] ?? [], 'CGU - Dolipocket');
		dpk_render('home.terms', $content);
	}
}
