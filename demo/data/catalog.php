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
 * \file    dolipocket/demo/data/catalog.php
 * \ingroup dolipocket
 * \brief   Demo catalog dataset (grocery / superette theme).
 *
 * Consumed by class/demodata.class.php (DolipocketDemoData). Adapted from the
 * SmartPOS demo catalog. See ~/docs/DEMO.md.
 *
 * Structure:
 *  - 'root'      : the single root product category
 *  - 'rayons'    : sub-categories, each with a VAT rate and a product list
 *  - 'customers' : demo third parties flagged client
 *  - 'suppliers' : demo third parties flagged supplier
 *  - 'contacts'  : demo contacts attached to a customer (by 0-based index)
 *
 * The 'key' fields are stable slugs used as image filenames (demo/img/...).
 * Third-party codes and product refs are generated in the class with a stable
 * prefix so the purge can find them again.
 */

return array(
	'root' => array(
		'label'       => 'Catalogue de démonstration',
		'description' => 'Catalogue de démonstration Dolipocket - thème épicerie / supérette.',
	),

	'rayons' => array(

		array(
			'key' => 'fruits-legumes', 'label' => 'Fruits et légumes', 'vat' => 5.5,
			'products' => array(
				array('key' => 'pommes-gala',    'label' => 'Pommes Gala (1 kg)',     'price' => 2.79),
				array('key' => 'bananes',        'label' => 'Bananes (1 kg)',         'price' => 1.99),
				array('key' => 'tomates-grappe', 'label' => 'Tomates grappe (500 g)', 'price' => 2.49),
				array('key' => 'carottes',       'label' => 'Carottes (1 kg)',        'price' => 1.29),
			),
		),

		array(
			'key' => 'boulangerie', 'label' => 'Boulangerie', 'vat' => 5.5,
			'products' => array(
				array('key' => 'baguette',      'label' => 'Baguette tradition',    'price' => 1.20),
				array('key' => 'pain-campagne', 'label' => 'Pain de campagne',      'price' => 2.80),
				array('key' => 'croissant',     'label' => 'Croissant pur beurre',  'price' => 1.10),
			),
		),

		array(
			'key' => 'cremerie', 'label' => 'Crémerie', 'vat' => 5.5,
			'products' => array(
				array('key' => 'brie',          'label' => 'Brie de Meaux (250 g)', 'price' => 3.50),
				array('key' => 'camembert',     'label' => 'Camembert (250 g)',     'price' => 2.90),
				array('key' => 'yaourt-nature', 'label' => 'Yaourts nature (x8)',   'price' => 1.85),
			),
		),

		array(
			'key' => 'boissons', 'label' => 'Boissons', 'vat' => 5.5,
			'products' => array(
				array('key' => 'jus-orange',   'label' => 'Jus d\'orange (1 L)',            'price' => 2.35),
				array('key' => 'eau-minerale', 'label' => 'Eau minérale (pack 6x1,5 L)',    'price' => 3.20),
			),
		),
	),

	'customers' => array(
		array('name' => 'Épicerie du Marché',        'email' => 'contact@epicerie-marche.demo.local',  'town' => 'Lyon',       'zip' => '69001'),
		array('name' => 'Restaurant Le Gourmet',     'email' => 'contact@legourmet.demo.local',        'town' => 'Paris',      'zip' => '75011'),
		array('name' => 'Boulangerie Petit Pain',    'email' => 'contact@petitpain.demo.local',        'town' => 'Bordeaux',   'zip' => '33000'),
		array('name' => 'Café des Sports',           'email' => 'contact@cafedessports.demo.local',    'town' => 'Marseille',  'zip' => '13006'),
		array('name' => 'Hôtel Beau Rivage',         'email' => 'contact@beaurivage.demo.local',       'town' => 'Nice',       'zip' => '06000'),
		array('name' => 'Traiteur Saveurs & Co',     'email' => 'contact@saveurs-co.demo.local',       'town' => 'Nantes',     'zip' => '44000'),
		array('name' => 'Superette Bellevue',        'email' => 'contact@bellevue.demo.local',         'town' => 'Toulouse',   'zip' => '31000'),
		array('name' => 'Crèche Les Petits Loups',   'email' => 'contact@petitsloups.demo.local',      'town' => 'Lille',      'zip' => '59000'),
		array('name' => 'Cantine Scolaire Jean Jaurès', 'email' => 'contact@cantine-jj.demo.local',    'town' => 'Rennes',     'zip' => '35000'),
		array('name' => 'Bar Le Central',            'email' => 'contact@lecentral.demo.local',        'town' => 'Strasbourg', 'zip' => '67000'),
	),

	'suppliers' => array(
		array('name' => 'Grossiste Primeurs Rhône',  'email' => 'ventes@primeurs-rhone.demo.local',    'town' => 'Corbas',     'zip' => '69960'),
		array('name' => 'Minoterie du Sud-Ouest',    'email' => 'ventes@minoterie-so.demo.local',      'town' => 'Agen',       'zip' => '47000'),
		array('name' => 'Laiterie des Volcans',      'email' => 'ventes@laiterie-volcans.demo.local',  'town' => 'Aurillac',   'zip' => '15000'),
		array('name' => 'Distribution Boissons Est', 'email' => 'ventes@boissons-est.demo.local',      'town' => 'Metz',       'zip' => '57000'),
		array('name' => 'Emballages Pro Services',   'email' => 'ventes@emballages-pro.demo.local',    'town' => 'Roissy',     'zip' => '95700'),
	),

	'contacts' => array(
		array('customer' => 0, 'firstname' => 'Claire',   'lastname' => 'Dubois',   'poste' => 'Gérante',              'phone' => '0472000001'),
		array('customer' => 1, 'firstname' => 'Marc',     'lastname' => 'Lefèvre',  'poste' => 'Chef de cuisine',     'phone' => '0143000002'),
		array('customer' => 2, 'firstname' => 'Sophie',   'lastname' => 'Moreau',   'poste' => 'Responsable achats',  'phone' => '0556000003'),
		array('customer' => 3, 'firstname' => 'Julien',   'lastname' => 'Garnier',  'poste' => 'Patron',              'phone' => '0491000004'),
		array('customer' => 4, 'firstname' => 'Nathalie', 'lastname' => 'Rousseau', 'poste' => 'Directrice',          'phone' => '0493000005'),
		array('customer' => 5, 'firstname' => 'Thomas',   'lastname' => 'Girard',   'poste' => 'Responsable',         'phone' => '0240000006'),
		array('customer' => 6, 'firstname' => 'Amélie',   'lastname' => 'Bernard',  'poste' => 'Gérante',             'phone' => '0561000007'),
		array('customer' => 9, 'firstname' => 'Karim',    'lastname' => 'Benali',   'poste' => 'Gérant',              'phone' => '0388000008'),
	),
);
