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
 * \file    dolipocket/class/demodata.class.php
 * \ingroup dolipocket
 * \brief   Generate and purge the Dolipocket demo dataset (grocery theme).
 *
 * Pure data/logic layer, free of any HTTP/GETPOST/rendering concern, so it can
 * be driven both by admin/demo.php and by an integration test. See ~/docs/DEMO.md.
 *
 * Multi-tenant: all objects are created in the current $conf->entity (the tenant
 * the admin is logged into). No demo user/group is created (the tenant already
 * owns its admin user), so there is no "fatal" object except the root category
 * that everything hangs off.
 */

require_once DOL_DOCUMENT_ROOT.'/core/lib/admin.lib.php';
require_once DOL_DOCUMENT_ROOT.'/core/lib/files.lib.php';
require_once DOL_DOCUMENT_ROOT.'/categories/class/categorie.class.php';
require_once DOL_DOCUMENT_ROOT.'/product/class/product.class.php';
require_once DOL_DOCUMENT_ROOT.'/societe/class/societe.class.php';
require_once DOL_DOCUMENT_ROOT.'/contact/class/contact.class.php';
require_once DOL_DOCUMENT_ROOT.'/comm/propal/class/propal.class.php';
require_once DOL_DOCUMENT_ROOT.'/commande/class/commande.class.php';
require_once DOL_DOCUMENT_ROOT.'/compta/facture/class/facture.class.php';
require_once DOL_DOCUMENT_ROOT.'/fourn/class/fournisseur.commande.class.php';
require_once DOL_DOCUMENT_ROOT.'/fourn/class/fournisseur.facture.class.php';
require_once DOL_DOCUMENT_ROOT.'/supplier_proposal/class/supplier_proposal.class.php';
require_once DOL_DOCUMENT_ROOT.'/comm/action/class/actioncomm.class.php';
require_once DOL_DOCUMENT_ROOT.'/expedition/class/expedition.class.php';
require_once DOL_DOCUMENT_ROOT.'/reception/class/reception.class.php';
require_once DOL_DOCUMENT_ROOT.'/fourn/class/fournisseur.commande.dispatch.class.php';
require_once DOL_DOCUMENT_ROOT.'/projet/class/project.class.php';

/**
 * Dolipocket demo data generator/purger.
 */
class DolipocketDemoData
{
	/** @var string Constant holding the demo root category id (install marker). */
	const ROOT_CONST = 'DOLIPOCKET_DEMO_ROOT_CATEGORY';

	/** @var int Number of demo proposals (devis) to generate. */
	const PROPOSAL_COUNT = 10;

	/** @var int Number of demo orders (commandes) to generate. */
	const ORDER_COUNT = 8;

	/** @var int Number of demo customer invoices (factures) to generate. */
	const INVOICE_COUNT = 8;

	/** @var int Number of demo supplier orders (commandes fournisseur) to generate. */
	const SUPPLIER_ORDER_COUNT = 6;

	/** @var int Number of demo supplier invoices (factures fournisseur) to generate. */
	const SUPPLIER_INVOICE_COUNT = 6;

	/** @var int Number of demo supplier price requests (demandes de prix) to generate. */
	const SUPPLIER_PROPOSAL_COUNT = 6;

	/** @var int Number of demo agenda events (ActionComm) to generate. */
	const AGENDA_COUNT = 8;

	/** @var int Number of demo shipments (expeditions) - one per validated order. */
	const SHIPMENT_COUNT = 4;

	/** @var int Number of demo receptions - one per validated supplier order. */
	const RECEPTION_COUNT = 3;

	/** @var int Number of demo projects (projets) to generate. */
	const PROJECT_COUNT = 6;

	/** @var string Product reference prefix (purge marker). */
	const PROD_REF_PREFIX = 'DPKD-';

	/** @var string Customer code_client prefix (purge marker). */
	const CLIENT_CODE_PREFIX = 'CU-DPKD-';

	/** @var string Supplier code_fournisseur prefix (purge marker). */
	const SUPPLIER_CODE_PREFIX = 'SU-DPKD-';

	/** @var DoliDB */
	private $db;

	/** @var string Absolute path to the catalog dataset file. */
	private $catalogFile;

	/** @var string Absolute path to the demo image base directory. */
	private $imgBase;

	/** @var string[] Human-readable log of the last operation. */
	public $results = array();

	/**
	 * Constructor.
	 *
	 * @param DoliDB      $db          Database handler
	 * @param string|null $catalogFile Override catalog path (defaults to module path)
	 * @param string|null $imgBase     Override image base dir (defaults to module path)
	 */
	public function __construct($db, $catalogFile = null, $imgBase = null)
	{
		$this->db = $db;
		$this->catalogFile = $catalogFile ? $catalogFile : dol_buildpath('/dolipocket/demo/data/catalog.php', 0);
		$this->imgBase = $imgBase ? $imgBase : dol_buildpath('/dolipocket/demo/img', 0);
	}

	/**
	 * Collect all error messages of a Dolibarr object (->error + ->errors).
	 *
	 * @param  object $obj
	 * @return string
	 */
	private function collectErrors($obj)
	{
		$msgs = array();
		if (!empty($obj->error)) {
			$msgs[] = $obj->error;
		}
		if (!empty($obj->errors) && is_array($obj->errors)) {
			foreach ($obj->errors as $e) {
				if (!empty($e) && $e !== $obj->error) {
					$msgs[] = $e;
				}
			}
		}
		return $msgs ? implode(' | ', $msgs) : '(aucun message d\'erreur)';
	}

	/**
	 * Whether the demo dataset is currently installed (root category exists).
	 *
	 * @return bool
	 */
	public function isInstalled()
	{
		$rootId = (int) getDolGlobalString(self::ROOT_CONST, 0);
		if ($rootId <= 0) {
			return false;
		}
		$cat = new Categorie($this->db);
		return ($cat->fetch($rootId) > 0);
	}

	/**
	 * Copy a product image into the standard Dolibarr product photo directory
	 * (multidir_output[entity]/<ref>) and generate thumbnails. Robust in CLI /
	 * test contexts (a plain copy, not move_uploaded_file).
	 *
	 * @param  Product $product Fetched product (needs ->ref and ->entity)
	 * @param  string  $srcImg  Absolute path to the source image
	 * @return bool
	 */
	private function copyProductImage($product, $srcImg)
	{
		global $conf;

		if (!is_file($srcImg)) {
			return false;
		}
		$baseDir = !empty($conf->product->multidir_output[$conf->entity])
			? $conf->product->multidir_output[$conf->entity]
			: (!empty($conf->product->dir_output) ? $conf->product->dir_output : '');
		if ($baseDir === '') {
			dol_syslog('DPK demo: product output dir not configured, skipping image', LOG_WARNING);
			return false;
		}
		$destDir = $baseDir.'/'.dol_sanitizeFileName($product->ref);
		if (!dol_is_dir($destDir)) {
			dol_mkdir($destDir);
		}
		$destFile = $destDir.'/'.basename($srcImg);
		if (!@copy($srcImg, $destFile)) {
			dol_syslog('DPK demo: product image copy failed to '.$destFile, LOG_WARNING);
			return false;
		}
		if (method_exists($product, 'addThumbs')) {
			$product->addThumbs($destFile);
		}
		return true;
	}

	/**
	 * Generate the whole demo dataset.
	 *
	 * @param  User $user       User performing the action
	 * @param  bool $copyImages Copy product images after commit
	 * @return array{error:int,warnings:int,results:string[],summary:string,rootId:int,counts:array<string,int>}
	 */
	public function generate($user, $copyImages = true)
	{
		global $conf;

		$this->results = array();
		$counts = array('rayons' => 0, 'products' => 0, 'customers' => 0, 'suppliers' => 0, 'contacts' => 0, 'proposals' => 0, 'orders' => 0, 'invoices' => 0, 'supplier_orders' => 0, 'supplier_invoices' => 0, 'supplier_proposals' => 0, 'agenda' => 0, 'shipments' => 0, 'receptions' => 0, 'projects' => 0, 'images' => 0);

		if ($this->isInstalled()) {
			$this->results[] = '[WARN] Jeu de démonstration déjà installé - purger d\'abord';
			return array('error' => 0, 'warnings' => 1, 'results' => $this->results, 'summary' => 'already_installed', 'rootId' => (int) getDolGlobalString(self::ROOT_CONST, 0), 'counts' => $counts);
		}

		if (!is_file($this->catalogFile)) {
			$this->results[] = '[ERREUR] Catalogue introuvable : '.$this->catalogFile;
			dol_syslog('DPK demo: catalog file missing: '.$this->catalogFile, LOG_ERR);
			return array('error' => 1, 'warnings' => 0, 'results' => $this->results, 'summary' => 'no_catalog', 'rootId' => 0, 'counts' => $counts);
		}
		$catalog = require $this->catalogFile;
		if (empty($catalog['rayons'])) {
			$this->results[] = '[ERREUR] Catalogue vide';
			return array('error' => 1, 'warnings' => 0, 'results' => $this->results, 'summary' => 'empty_catalog', 'rootId' => 0, 'counts' => $counts);
		}

		$this->db->begin();
		$error      = 0;   // fatal: rollback (root category only)
		$warnings   = 0;   // non-fatal
		$imageTasks = array();
		$rootId     = 0;
		$customerIds = array();
		$supplierIds = array();
		$validatedOrderIds = array();
		$validatedSupplierOrderIds = array();
		$createdProducts = array();

		// 1. Root category (FATAL) ---------------------------------------
		$root = new Categorie($this->db);
		$root->label       = $catalog['root']['label'];
		$root->description = isset($catalog['root']['description']) ? $catalog['root']['description'] : '';
		$root->type        = Categorie::TYPE_PRODUCT;
		$root->visible     = 1;
		$root->fk_parent   = 0;
		$rootId = $root->create($user);
		if ($rootId <= 0) {
			$error++;
			$this->results[] = '[ERREUR] Catégorie racine non créée : '.$this->collectErrors($root);
			dol_syslog('DPK demo: root category creation failed: '.$this->collectErrors($root), LOG_ERR);
		} else {
			$vRoot = new Categorie($this->db);
			if ($vRoot->fetch($rootId) <= 0) {
				$error++;
				$this->results[] = '[ERREUR] Catégorie racine créée (ID '.$rootId.') mais non retrouvée';
				dol_syslog('DPK demo: root category not found after create', LOG_ERR);
			} else {
				$this->results[] = '[OK] Catégorie racine : '.$vRoot->label.' (ID '.$rootId.')';

				// 2. Rayons + products -----------------------------------
				$counter = 0;
				foreach ($catalog['rayons'] as $rayon) {
					$cat = new Categorie($this->db);
					$cat->label     = $rayon['label'];
					$cat->type      = Categorie::TYPE_PRODUCT;
					$cat->visible   = 1;
					$cat->fk_parent = $rootId;
					$catId = $cat->create($user);
					if ($catId <= 0) {
						$warnings++;
						$this->results[] = '[WARN] Rayon '.$rayon['label'].' : '.$this->collectErrors($cat);
						dol_syslog('DPK demo: rayon creation failed ('.$rayon['label'].')', LOG_WARNING);
						continue;
					}
					$vCat = new Categorie($this->db);
					if ($vCat->fetch($catId) <= 0) {
						$warnings++;
						$this->results[] = '[WARN] Rayon créé (ID '.$catId.') mais non retrouvé : '.$rayon['label'];
						dol_syslog('DPK demo: rayon not found after create', LOG_WARNING);
						continue;
					}
					$counts['rayons']++;

					$vat = isset($rayon['vat']) ? (float) $rayon['vat'] : 20.0;

					foreach ($rayon['products'] as $p) {
						$counter++;
						$ref = self::PROD_REF_PREFIX.sprintf('%05d', $counter);

						$prod = new Product($this->db);
						$prod->ref             = $ref;
						$prod->label           = $p['label'];
						$prod->description     = $p['label'];
						$prod->type            = Product::TYPE_PRODUCT;
						$prod->status          = 1;   // tosell
						$prod->status_buy      = 1;   // tobuy (purchase cycle demo later)
						$prod->price_base_type = 'TTC';
						$prod->price_ttc       = (float) $p['price'];
						$prod->tva_tx          = $vat;
						$prod->entity          = $conf->entity;

						$pid = $prod->create($user);
						if ($pid <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Produit '.$p['label'].' : '.$this->collectErrors($prod);
							dol_syslog('DPK demo: product creation failed ('.$p['label'].')', LOG_WARNING);
							continue;
						}
						$vProd = new Product($this->db);
						if ($vProd->fetch($pid) <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Produit créé (ID '.$pid.') mais non retrouvé : '.$p['label'];
							dol_syslog('DPK demo: product not found after create', LOG_WARNING);
							continue;
						}

						$linkRes = $vCat->add_type($vProd, 'product');
						if ($linkRes < 0) {
							$warnings++;
							$this->results[] = '[WARN] Liaison catégorie échouée pour '.$p['label'];
							dol_syslog('DPK demo: category link failed for product id '.$pid, LOG_WARNING);
						}
						$counts['products']++;
						$createdProducts[] = array(
							'id'    => (int) $pid,
							'price' => (float) $vProd->price,
							'tva'   => (string) $vProd->tva_tx,
							'label' => (string) $vProd->label,
							'type'  => (int) $vProd->type,
						);

						if ($copyImages && isset($p['key'])) {
							$prodImg = $this->imgBase.'/products/'.$p['key'].'.jpg';
							if (is_file($prodImg)) {
								$imageTasks[] = array('id' => (int) $pid, 'src' => $prodImg);
							}
						}
					}
				}
				$this->results[] = '[OK] '.$counts['rayons'].' rayons et '.$counts['products'].' produits créés';

				// 3. Customers -------------------------------------------
				$customers = isset($catalog['customers']) ? $catalog['customers'] : array();
				$seq = 0;
				foreach ($customers as $c) {
					$seq++;
					$soc = new Societe($this->db);
					$soc->name        = $c['name'];
					$soc->code_client = self::CLIENT_CODE_PREFIX.sprintf('%03d', $seq);
					$soc->client      = 1;
					$soc->fournisseur = 0;
					$soc->status      = 1;
					$soc->country_id  = 1;
					$soc->entity      = $conf->entity;
					if (!empty($c['email'])) {
						$soc->email = $c['email'];
					}
					if (!empty($c['town'])) {
						$soc->town = $c['town'];
					}
					if (!empty($c['zip'])) {
						$soc->zip = $c['zip'];
					}
					$socRes = $soc->create($user);
					if ($socRes > 0 && $soc->id > 0) {
						$vSoc = new Societe($this->db);
						if ($vSoc->fetch($soc->id) > 0) {
							$counts['customers']++;
							$customerIds[] = (int) $soc->id;
						} else {
							$customerIds[] = 0;
							$warnings++;
							$this->results[] = '[WARN] Client créé mais non retrouvé : '.$c['name'];
							dol_syslog('DPK demo: customer not found after create ('.$c['name'].')', LOG_WARNING);
						}
					} else {
						$customerIds[] = 0;
						$warnings++;
						$this->results[] = '[WARN] Client '.$c['name'].' : '.$this->collectErrors($soc);
						dol_syslog('DPK demo: customer creation failed ('.$c['name'].')', LOG_WARNING);
					}
				}
				$this->results[] = '[OK] '.$counts['customers'].' clients créés';

				// 4. Suppliers -------------------------------------------
				$suppliers = isset($catalog['suppliers']) ? $catalog['suppliers'] : array();
				$seq = 0;
				foreach ($suppliers as $s) {
					$seq++;
					$soc = new Societe($this->db);
					$soc->name             = $s['name'];
					$soc->code_fournisseur = self::SUPPLIER_CODE_PREFIX.sprintf('%03d', $seq);
					$soc->client           = 0;
					$soc->fournisseur      = 1;
					$soc->status           = 1;
					$soc->country_id       = 1;
					$soc->entity           = $conf->entity;
					if (!empty($s['email'])) {
						$soc->email = $s['email'];
					}
					if (!empty($s['town'])) {
						$soc->town = $s['town'];
					}
					if (!empty($s['zip'])) {
						$soc->zip = $s['zip'];
					}
					$socRes = $soc->create($user);
					if ($socRes > 0 && $soc->id > 0) {
						$counts['suppliers']++;
						$supplierIds[] = (int) $soc->id;
					} else {
						$warnings++;
						$this->results[] = '[WARN] Fournisseur '.$s['name'].' : '.$this->collectErrors($soc);
						dol_syslog('DPK demo: supplier creation failed ('.$s['name'].')', LOG_WARNING);
					}
				}
				$this->results[] = '[OK] '.$counts['suppliers'].' fournisseurs créés';

				// 5. Contacts (attached to a customer by index) ----------
				$contacts = isset($catalog['contacts']) ? $catalog['contacts'] : array();
				foreach ($contacts as $ct) {
					$idx = isset($ct['customer']) ? (int) $ct['customer'] : -1;
					$socId = ($idx >= 0 && isset($customerIds[$idx])) ? $customerIds[$idx] : 0;
					if ($socId <= 0) {
						$warnings++;
						$this->results[] = '[WARN] Contact '.$ct['lastname'].' : client cible indisponible';
						dol_syslog('DPK demo: contact target customer unavailable', LOG_WARNING);
						continue;
					}
					$contact = new Contact($this->db);
					$contact->socid     = $socId;
					$contact->firstname = $ct['firstname'];
					$contact->lastname  = $ct['lastname'];
					$contact->poste     = isset($ct['poste']) ? $ct['poste'] : '';
					$contact->phone_pro = isset($ct['phone']) ? $ct['phone'] : '';
					$contact->statut    = 1;
					$contact->country_id = 1;
					$contact->entity    = $conf->entity;
					$slug = strtolower($ct['firstname'].'.'.$ct['lastname']);
					$slug = preg_replace('/[^a-z0-9.]+/', '', $slug);
					$contact->email     = $slug.'@demo.local';
					$ctRes = $contact->create($user);
					if ($ctRes > 0) {
						$counts['contacts']++;
					} else {
						$warnings++;
						$this->results[] = '[WARN] Contact '.$ct['lastname'].' : '.$this->collectErrors($contact);
						dol_syslog('DPK demo: contact creation failed ('.$ct['lastname'].')', LOG_WARNING);
					}
				}
				$this->results[] = '[OK] '.$counts['contacts'].' contacts créés';

				// 6. Proposals (devis) -----------------------------------
				$validCustomers = array();
				foreach ($customerIds as $cid) {
					if ($cid > 0) {
						$validCustomers[] = $cid;
					}
				}
				if (!empty($createdProducts) && !empty($validCustomers)) {
					// Ensure a proposal numbering addon is configured so valid()
					// can mint a ref. Real Dolipocket tenants get one from the
					// provisioner; be defensive on a bare install (mirrors
					// DEMO.md's USER_PASSWORD_GENERATED handling).
					if (empty($conf->global->PROPALE_ADDON)) {
						$conf->global->PROPALE_ADDON = 'mod_propale_marbre';
					}
					$nbProdAvail = count($createdProducts);
					$nbCustAvail = count($validCustomers);
					for ($i = 0; $i < self::PROPOSAL_COUNT; $i++) {
						$propal = new Propal($this->db);
						$propal->socid        = $validCustomers[$i % $nbCustAvail];
						$propal->date         = dol_now();
						$propal->datep        = $propal->date;
						$propal->note_private = '[DEMO-DPKD] Devis de démonstration';
						$propal->entity       = $conf->entity;
						$pRes = $propal->create($user);
						if ($pRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Devis #'.($i + 1).' : '.$this->collectErrors($propal);
							dol_syslog('DPK demo: proposal creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}

						// 2 to 4 product lines, deterministic selection.
						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdAvail];
							$qty  = 1 + (($i + $j) % 5);
							$lineRes = $propal->addline(
								$prod['label'],
								(float) $prod['price'],
								$qty,
								(string) $prod['tva'],
								0.0,
								0.0,
								(int) $prod['id'],
								0.0,
								'HT',
								0.0,
								0,
								(int) $prod['type'],
								-1,
								0,
								0,
								0,
								0,
								$prod['label'],
								'',
								'',
								0,
								null
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne devis #'.($i + 1).' : '.$this->collectErrors($propal);
								dol_syslog('DPK demo: proposal line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other proposal so the demo shows a mix
						// of draft and validated devis.
						if ($i % 2 === 0) {
							if ($propal->valid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation devis #'.($i + 1).' : '.$this->collectErrors($propal);
								dol_syslog('DPK demo: proposal validation failed (#'.($i + 1).')', LOG_WARNING);
							}
						}
						$counts['proposals']++;
					}
					$this->results[] = '[OK] '.$counts['proposals'].' devis créés';
				} else {
					$this->results[] = '[WARN] Devis non générés : produits ou clients indisponibles';
					dol_syslog('DPK demo: proposals skipped (no products or customers)', LOG_WARNING);
				}

				// 7. Orders (commandes) ----------------------------------
				if (!empty($createdProducts) && !empty($validCustomers)) {
					// Ensure an order numbering addon (real tenants get one from
					// the provisioner). Note: Commande::addline has a DIFFERENT
					// argument order than Propal::addline.
					if (empty($conf->global->COMMANDE_ADDON)) {
						$conf->global->COMMANDE_ADDON = 'mod_commande_marbre';
					}
					// Commande::valid() renames its document directory using
					// $conf->commande->multidir_output; ensure it exists (real
					// tenants have it, a bare install/harness may not).
					if (!isset($conf->commande) || !is_object($conf->commande)) {
						$conf->commande = new stdClass();
					}
					if (empty($conf->commande->multidir_output)) {
						$orderBaseDir = !empty($conf->commande->dir_output) ? $conf->commande->dir_output : DOL_DATA_ROOT.'/commande';
						$conf->commande->multidir_output = array($conf->entity => $orderBaseDir);
					}
					$nbProdForOrders = count($createdProducts);
					$nbCustForOrders = count($validCustomers);
					for ($i = 0; $i < self::ORDER_COUNT; $i++) {
						$cmd = new Commande($this->db);
						$cmd->socid         = $validCustomers[$i % $nbCustForOrders];
						$cmd->date          = dol_now();
						$cmd->date_commande = $cmd->date;
						$cmd->note_private  = '[DEMO-DPKD] Commande de démonstration';
						$cmd->entity        = $conf->entity;
						$cRes = $cmd->create($user);
						if ($cRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Commande #'.($i + 1).' : '.$this->collectErrors($cmd);
							dol_syslog('DPK demo: order creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}

						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdForOrders];
							$qty  = 1 + (($i + $j) % 5);
							// Commande::addline: desc, pu_ht, qty, txtva, ltax1,
							// ltax2, fk_product, remise, info_bits, fk_remise_except,
							// price_base_type, pu_ttc, date_start, date_end, type,
							// rang, special_code, fk_parent_line, fk_fournprice,
							// pa_ht, label, array_options, fk_unit.
							$lineRes = $cmd->addline(
								$prod['label'],
								(float) $prod['price'],
								$qty,
								(string) $prod['tva'],
								0,
								0,
								(int) $prod['id'],
								0,
								0,
								0,
								'HT',
								0,
								'',
								'',
								(int) $prod['type'],
								-1,
								0,
								0,
								null,
								0,
								$prod['label'],
								0,
								null
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne commande #'.($i + 1).' : '.$this->collectErrors($cmd);
								dol_syslog('DPK demo: order line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other order (mix of draft and validated).
						// Track validated order ids so shipments can be built from them.
						if ($i % 2 === 0) {
							if ($cmd->valid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation commande #'.($i + 1).' : '.$this->collectErrors($cmd);
								dol_syslog('DPK demo: order validation failed (#'.($i + 1).')', LOG_WARNING);
							} else {
								$validatedOrderIds[] = (int) $cmd->id;
							}
						}
						$counts['orders']++;
					}
					$this->results[] = '[OK] '.$counts['orders'].' commandes créées';
				} else {
					$this->results[] = '[WARN] Commandes non générées : produits ou clients indisponibles';
					dol_syslog('DPK demo: orders skipped (no products or customers)', LOG_WARNING);
				}

				// 7b. Customer invoices (factures) ----------------------
				if (!empty($createdProducts) && !empty($validCustomers)) {
					// FACTURE_ADDON = mod_facture_terre (SELECT MAX, SQL) - real
					// tenants get it from the provisioner. Facture::validate()
					// renames the PROV dir via $conf->facture->dir_output; set it
					// defensively on a bare harness. Only the standard invoice
					// type is generated for the demo.
					if (empty($conf->global->FACTURE_ADDON)) {
						$conf->global->FACTURE_ADDON = 'mod_facture_terre';
					}
					if (!isset($conf->facture) || !is_object($conf->facture)) {
						$conf->facture = new stdClass();
					}
					if (empty($conf->facture->dir_output)) {
						$conf->facture->dir_output = DOL_DATA_ROOT.'/facture';
					}
					if (empty($conf->facture->multidir_output)) {
						$conf->facture->multidir_output = array($conf->entity => $conf->facture->dir_output);
					}
					$nbProdForInv = count($createdProducts);
					$nbCustForInv = count($validCustomers);
					for ($i = 0; $i < self::INVOICE_COUNT; $i++) {
						$fac = new Facture($this->db);
						$fac->socid        = $validCustomers[$i % $nbCustForInv];
						$fac->date         = dol_now();
						$fac->type         = Facture::TYPE_STANDARD;
						$fac->note_private = '[DEMO-DPKD] Facture de démonstration';
						$fac->entity       = $conf->entity;
						$fRes = $fac->create($user);
						if ($fRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Facture #'.($i + 1).' : '.$this->collectErrors($fac);
							dol_syslog('DPK demo: invoice creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}

						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdForInv];
							$qty  = 1 + (($i + $j) % 5);
							// Facture::addline product line (positional): desc, pu_ht,
							// qty, txtva, localtax1, localtax2, fk_product.
							$lineRes = $fac->addline(
								$prod['label'],
								(float) $prod['price'],
								$qty,
								(string) $prod['tva'],
								0,
								0,
								(int) $prod['id']
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne facture #'.($i + 1).' : '.$this->collectErrors($fac);
								dol_syslog('DPK demo: invoice line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other invoice (mix of draft/validated).
						if ($i % 2 === 0) {
							if ($fac->validate($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation facture #'.($i + 1).' : '.$this->collectErrors($fac);
								dol_syslog('DPK demo: invoice validation failed (#'.($i + 1).')', LOG_WARNING);
							}
						}
						$counts['invoices']++;
					}
					$this->results[] = '[OK] '.$counts['invoices'].' factures créées';
				} else {
					$this->results[] = '[WARN] Factures non générées : produits ou clients indisponibles';
					dol_syslog('DPK demo: invoices skipped (no products or customers)', LOG_WARNING);
				}

				// 8. Supplier orders (commandes fournisseur) ------------
				$validSuppliers = array();
				foreach ($supplierIds as $sup) {
					if ($sup > 0) {
						$validSuppliers[] = $sup;
					}
				}
				if (!empty($createdProducts) && !empty($validSuppliers)) {
					// Numbering addon (real tenants get one from the provisioner, but
					// COMMANDE_SUPPLIER_ADDON_NUMBER is not part of the baseline set).
					// mod_commande_fournisseur_muguet uses SELECT MAX (SQL), safe on
					// the harness. Note: CommandeFournisseur::addline has NO $label
					// parameter and yet another argument order (type at position 13).
					if (empty($conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER)) {
						$conf->global->COMMANDE_SUPPLIER_ADDON_NUMBER = 'mod_commande_fournisseur_muguet';
					}
					// valid() dereferences $conf->fournisseur->commande->dir_output in
					// the PROV-rename branch; ensure it resolves on a bare harness.
					if (!isset($conf->fournisseur) || !is_object($conf->fournisseur)) {
						$conf->fournisseur = new stdClass();
					}
					if (!isset($conf->fournisseur->commande) || !is_object($conf->fournisseur->commande)) {
						$conf->fournisseur->commande = new stdClass();
					}
					if (empty($conf->fournisseur->commande->dir_output)) {
						$conf->fournisseur->commande->dir_output = DOL_DATA_ROOT.'/fournisseur/commande';
					}
					$nbProdForSupOrders = count($createdProducts);
					$nbSupForSupOrders = count($validSuppliers);
					for ($i = 0; $i < self::SUPPLIER_ORDER_COUNT; $i++) {
						$scmd = new CommandeFournisseur($this->db);
						$scmd->socid         = $validSuppliers[$i % $nbSupForSupOrders];
						$scmd->date          = dol_now();
						$scmd->date_commande = $scmd->date;
						$scmd->note_private  = '[DEMO-DPKD] Commande fournisseur de démonstration';
						$scmd->entity        = $conf->entity;
						$scRes = $scmd->create($user);
						if ($scRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Commande fournisseur #'.($i + 1).' : '.$this->collectErrors($scmd);
							dol_syslog('DPK demo: supplier order creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}
						// Populate ->thirdparty so localtax lookups in addline work.
						$scmd->fetch_thirdparty();

						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdForSupOrders];
							$qty  = 1 + (($i + $j) % 5);
							// CommandeFournisseur::addline: desc, pu_ht, qty, txtva,
							// txlocaltax1, txlocaltax2, fk_product, fk_prod_fourn_price,
							// ref_supplier, remise_percent, price_base_type, pu_ttc,
							// type, info_bits, notrigger, date_start, date_end,
							// array_options, fk_unit, pu_ht_devise, origin, origin_id,
							// rang, special_code. There is NO $label parameter.
							$lineRes = $scmd->addline(
								$prod['label'],
								(float) $prod['price'],
								$qty,
								(string) $prod['tva'],
								0.0,
								0.0,
								(int) $prod['id'],
								0,
								'',
								0.0,
								'HT',
								0.0,
								(int) $prod['type'],
								0,
								false,
								null,
								null,
								0,
								null,
								0,
								'',
								0,
								-1,
								0
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne commande fournisseur #'.($i + 1).' : '.$this->collectErrors($scmd);
								dol_syslog('DPK demo: supplier order line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other supplier order (mix of draft/validated).
						// Track validated ids so receptions can be built from them.
						if ($i % 2 === 0) {
							if ($scmd->valid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation commande fournisseur #'.($i + 1).' : '.$this->collectErrors($scmd);
								dol_syslog('DPK demo: supplier order validation failed (#'.($i + 1).')', LOG_WARNING);
							} else {
								$validatedSupplierOrderIds[] = (int) $scmd->id;
							}
						}
						$counts['supplier_orders']++;
					}
					$this->results[] = '[OK] '.$counts['supplier_orders'].' commandes fournisseur créées';
				} else {
					$this->results[] = '[WARN] Commandes fournisseur non générées : produits ou fournisseurs indisponibles';
					dol_syslog('DPK demo: supplier orders skipped (no products or suppliers)', LOG_WARNING);
				}

				// 9. Supplier invoices (factures fournisseur) -----------
				if (!empty($createdProducts) && !empty($validSuppliers)) {
					// mod_facture_fournisseur_cactus uses SELECT MAX (SQL), safe on
					// the harness. FactureFournisseur::addline has a UNIQUE 24-arg
					// order (txtva at pos 3, qty at pos 6, type at pos 14, no label);
					// validate() (not valid()) mints the ref.
					if (empty($conf->global->INVOICE_SUPPLIER_ADDON_NUMBER)) {
						$conf->global->INVOICE_SUPPLIER_ADDON_NUMBER = 'mod_facture_fournisseur_cactus';
					}
					// validate()/delete() dereference $conf->fournisseur->facture->dir_output
					// in the PROV-rename branch; ensure it resolves on a bare harness.
					if (!isset($conf->fournisseur) || !is_object($conf->fournisseur)) {
						$conf->fournisseur = new stdClass();
					}
					if (!isset($conf->fournisseur->facture) || !is_object($conf->fournisseur->facture)) {
						$conf->fournisseur->facture = new stdClass();
					}
					if (empty($conf->fournisseur->facture->dir_output)) {
						$conf->fournisseur->facture->dir_output = DOL_DATA_ROOT.'/'.$conf->entity.'/fournisseur/facture';
					}
					$nbProdForSupInv = count($createdProducts);
					$nbSupForSupInv = count($validSuppliers);
					for ($i = 0; $i < self::SUPPLIER_INVOICE_COUNT; $i++) {
						$sfac = new FactureFournisseur($this->db);
						$sfac->socid        = $validSuppliers[$i % $nbSupForSupInv];
						$sfac->ref_supplier = 'DEMO-FF-'.$conf->entity.'-'.($i + 1);
						$sfac->type         = FactureFournisseur::TYPE_STANDARD;
						$sfac->date         = dol_now();
						$sfac->note_private = '[DEMO-DPKD] Facture fournisseur de démonstration';
						$sfac->entity       = $conf->entity;
						$sfRes = $sfac->create($user);
						if ($sfRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Facture fournisseur #'.($i + 1).' : '.$this->collectErrors($sfac);
							dol_syslog('DPK demo: supplier invoice creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}
						$sfac->fetch_thirdparty();
						// Defensive under PHP 8.2 strict: addline reads $this->special_code.
						$sfac->special_code = 0;

						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdForSupInv];
							$qty  = 1 + (($i + $j) % 5);
							// FactureFournisseur::addline (24 args): desc, pu, txtva,
							// txlocaltax1, txlocaltax2, qty, fk_product, remise_percent,
							// date_start, date_end, ventil, info_bits, price_base_type,
							// type, rang, notrigger, array_options, fk_unit, origin_id,
							// pu_devise, ref_supplier, special_code, fk_parent_line,
							// fk_remise_except.
							$lineRes = $sfac->addline(
								$prod['label'],
								(float) $prod['price'],
								(string) $prod['tva'],
								0,
								0,
								$qty,
								(int) $prod['id'],
								0,
								'',
								'',
								0,
								0,
								'HT',
								(int) $prod['type'],
								-1,
								0,
								0,
								null,
								0,
								0,
								'',
								'',
								0,
								0
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne facture fournisseur #'.($i + 1).' : '.$this->collectErrors($sfac);
								dol_syslog('DPK demo: supplier invoice line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other supplier invoice (mix of draft/validated).
						if ($i % 2 === 0) {
							if ($sfac->validate($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation facture fournisseur #'.($i + 1).' : '.$this->collectErrors($sfac);
								dol_syslog('DPK demo: supplier invoice validation failed (#'.($i + 1).')', LOG_WARNING);
							}
						}
						$counts['supplier_invoices']++;
					}
					$this->results[] = '[OK] '.$counts['supplier_invoices'].' factures fournisseur créées';
				} else {
					$this->results[] = '[WARN] Factures fournisseur non générées : produits ou fournisseurs indisponibles';
					dol_syslog('DPK demo: supplier invoices skipped (no products or suppliers)', LOG_WARNING);
				}

				// 10. Supplier price requests (demandes de prix) --------
				if (!empty($createdProducts) && !empty($validSuppliers)) {
					// mod_supplier_proposal_marbre uses SELECT MAX (SQL). valid()
					// dereferences $conf->supplier_proposal->dir_output in the
					// PROV-rename branch; set it defensively. Class-specific
					// addline order: fk_product at pos 7, price_base_type at 9,
					// type at 12, rang=-1 at 13, label at 18.
					if (empty($conf->global->SUPPLIER_PROPOSAL_ADDON)) {
						$conf->global->SUPPLIER_PROPOSAL_ADDON = 'mod_supplier_proposal_marbre';
					}
					if (empty($conf->supplier_proposal) || !is_object($conf->supplier_proposal)) {
						$conf->supplier_proposal = new stdClass();
					}
					if (empty($conf->supplier_proposal->dir_output)) {
						$conf->supplier_proposal->dir_output = DOL_DATA_ROOT.'/supplier_proposal';
					}
					$nbProdForSp = count($createdProducts);
					$nbSupForSp = count($validSuppliers);
					for ($i = 0; $i < self::SUPPLIER_PROPOSAL_COUNT; $i++) {
						$sp = new SupplierProposal($this->db);
						$sp->socid        = $validSuppliers[$i % $nbSupForSp];
						$sp->date         = dol_now();
						$sp->note_private = '[DEMO-DPKD] Demande de prix de démonstration';
						$sp->entity       = $conf->entity;
						$spRes = $sp->create($user);
						if ($spRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Demande de prix #'.($i + 1).' : '.$this->collectErrors($sp);
							dol_syslog('DPK demo: supplier proposal creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}
						$sp->fetch_thirdparty();

						$nbLines = 2 + ($i % 3);
						for ($j = 0; $j < $nbLines; $j++) {
							$prod = $createdProducts[($i * 2 + $j) % $nbProdForSp];
							$qty  = 1 + (($i + $j) % 5);
							// SupplierProposal::addline (26 args): desc, pu_ht, qty,
							// txtva, txlocaltax1, txlocaltax2, fk_product,
							// remise_percent, price_base_type, pu_ttc, info_bits,
							// type, rang, special_code, fk_parent_line, fk_fournprice,
							// pa_ht, label, array_options, ref_supplier, fk_unit,
							// origin, origin_id, pu_ht_devise, date_start, date_end.
							$lineRes = $sp->addline(
								$prod['label'],
								(float) $prod['price'],
								$qty,
								(string) $prod['tva'],
								0,
								0,
								(int) $prod['id'],
								0,
								'HT',
								0,
								0,
								(int) $prod['type'],
								-1,
								0,
								0,
								0,
								0,
								$prod['label'],
								0,
								'',
								'',
								'',
								0,
								0,
								0,
								0
							);
							if ($lineRes <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Ligne demande de prix #'.($i + 1).' : '.$this->collectErrors($sp);
								dol_syslog('DPK demo: supplier proposal line failed (#'.($i + 1).')', LOG_WARNING);
							}
						}

						// Validate every other request (mix of draft/validated).
						if ($i % 2 === 0) {
							if ($sp->valid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation demande de prix #'.($i + 1).' : '.$this->collectErrors($sp);
								dol_syslog('DPK demo: supplier proposal validation failed (#'.($i + 1).')', LOG_WARNING);
							}
						}
						$counts['supplier_proposals']++;
					}
					$this->results[] = '[OK] '.$counts['supplier_proposals'].' demandes de prix créées';
				} else {
					$this->results[] = '[WARN] Demandes de prix non générées : produits ou fournisseurs indisponibles';
					dol_syslog('DPK demo: supplier proposals skipped (no products or suppliers)', LOG_WARNING);
				}

				// 11. Agenda events (ActionComm) ------------------------
				// Single flat rows, no lines, no PDF, no numbering addon, no
				// valid(): create() finalizes the ref (record id) in one call.
				// The demo marker lives in note_private, stored in the `note`
				// column. userownerid is mandatory. Events are attached to demo
				// customers (fk_soc optional).
				if (!empty($validCustomers)) {
					$nbCustForAgenda = count($validCustomers);
					for ($i = 0; $i < self::AGENDA_COUNT; $i++) {
						$evt = new ActionComm($this->db);
						$evt->type_code   = 'AC_RDV';
						$evt->label       = 'Rendez-vous de démonstration #'.($i + 1);
						$evt->datep       = dol_now() + ($i * 86400);
						$evt->datef       = $evt->datep + 3600;
						$evt->userownerid = (int) $user->id;
						$evt->fk_soc      = $validCustomers[$i % $nbCustForAgenda];
						// Mix of done (100%) and pending (0%) events.
						$evt->percentage  = ($i % 2 === 0) ? 100 : 0;
						$evt->note_private = '[DEMO-DPKD] Évènement de démonstration';
						$evt->entity      = $conf->entity;
						$eRes = $evt->create($user);
						if ($eRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Évènement agenda #'.($i + 1).' : '.$this->collectErrors($evt);
							dol_syslog('DPK demo: agenda event creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}
						$counts['agenda']++;
					}
					$this->results[] = '[OK] '.$counts['agenda'].' évènements agenda créés';
				} else {
					$this->results[] = '[WARN] Évènements agenda non générés : clients indisponibles';
					dol_syslog('DPK demo: agenda events skipped (no customers)', LOG_WARNING);
				}

				// 12. Shipments (expeditions) from validated demo orders
				// Expedition is origin-driven: built FROM a validated Commande,
				// never standalone. addline(entrepot_id, order_line_id, qty).
				if (!empty($validatedOrderIds)) {
					// mod_expedition_safor uses SELECT MAX (SQL). No warehouse
					// required and no stock movement so the seed needs no stock
					// plumbing. valid() dereferences $conf->expedition->dir_output.
					if (empty($conf->global->EXPEDITION_ADDON_NUMBER)) {
						$conf->global->EXPEDITION_ADDON_NUMBER = 'mod_expedition_safor';
					}
					$conf->global->STOCK_WAREHOUSE_NOT_REQUIRED_FOR_SHIPMENTS = 1;
					if (!isset($conf->expedition) || !is_object($conf->expedition)) {
						$conf->expedition = new stdClass();
					}
					if (empty($conf->expedition->dir_output)) {
						$conf->expedition->dir_output = DOL_DATA_ROOT.'/expedition';
					}
					if (empty($conf->expedition->multidir_output)) {
						$conf->expedition->multidir_output = array($conf->entity => $conf->expedition->dir_output);
					}
					$nbShip = 0;
					foreach ($validatedOrderIds as $oid) {
						if ($nbShip >= self::SHIPMENT_COUNT) {
							break;
						}
						$cmd = new Commande($this->db);
						if ($cmd->fetch($oid) <= 0) {
							continue;
						}
						$cmd->fetch_lines();
						if (empty($cmd->lines)) {
							continue;
						}
						$exp = new Expedition($this->db);
						$exp->origin       = 'commande';
						$exp->origin_id    = (int) $cmd->id;
						$exp->socid        = (int) $cmd->socid;
						$exp->note_private = '[DEMO-DPKD] Expédition de démonstration';
						$exp->entity       = $conf->entity;
						// Under PHP 8.2 strict, Expedition::create() reads many
						// optional header props; initialize them to avoid
						// "Undefined property" warnings (fatal under PHPUnit).
						$exp->date_expedition     = dol_now();
						$exp->date_delivery       = 0;
						$exp->ref_customer        = '';
						$exp->ref_ext             = '';
						$exp->fk_project          = 0;
						$exp->fk_delivery_address = 0;
						$exp->shipping_method_id  = 0;
						$exp->tracking_number     = '';
						$exp->weight              = 0;
						$exp->sizeS               = 0;
						$exp->sizeW               = 0;
						$exp->sizeH               = 0;
						$exp->weight_units        = 0;
						$exp->size_units          = 0;
						$exp->model_pdf           = '';
						$exp->fk_incoterms        = 0;
						$exp->location_incoterms  = '';
						$anyLine = false;
						foreach ($cmd->lines as $line) {
							// addline(entrepot_id=0, order_line_id, qty). Warehouse
							// 0 is allowed with STOCK_WAREHOUSE_NOT_REQUIRED_FOR_SHIPMENTS.
							if ($exp->addline(0, (int) $line->id, (float) $line->qty, 0) >= 0) {
								$anyLine = true;
							}
						}
						if (!$anyLine) {
							continue;
						}
						$eRes = $exp->create($user);
						if ($eRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Expédition (commande '.$oid.') : '.$this->collectErrors($exp);
							dol_syslog('DPK demo: shipment creation failed (order '.$oid.')', LOG_WARNING);
							continue;
						}
						// Validate every other shipment (mix of draft/validated).
						if ($nbShip % 2 === 0) {
							if ($exp->valid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation expédition (commande '.$oid.') : '.$this->collectErrors($exp);
								dol_syslog('DPK demo: shipment validation failed (order '.$oid.')', LOG_WARNING);
							}
						}
						$counts['shipments']++;
						$nbShip++;
					}
					$this->results[] = '[OK] '.$counts['shipments'].' expéditions créées';
				} else {
					$this->results[] = '[WARN] Expéditions non générées : aucune commande validée';
					dol_syslog('DPK demo: shipments skipped (no validated orders)', LOG_WARNING);
				}

				// 13. Receptions from validated demo supplier orders ----
				// Reception is origin-driven: built FROM a validated
				// CommandeFournisseur. addline(entrepot_id, supplier_order_line_id,
				// qty) returns the line INDEX (0 = success for the 1st line).
				if (!empty($validatedSupplierOrderIds)) {
					// mod_reception_beryl uses SELECT MAX (SQL). No warehouse
					// required and no stock movement (keep STOCK_CALCULATE_ON_RECEPTION
					// empty). valid() dereferences $conf->reception->dir_output.
					if (empty($conf->global->RECEPTION_ADDON_NUMBER)) {
						$conf->global->RECEPTION_ADDON_NUMBER = 'mod_reception_beryl';
					}
					$conf->global->STOCK_WAREHOUSE_NOT_REQUIRED_FOR_RECEPTIONS = 1;
					if (!empty($conf->global->STOCK_CALCULATE_ON_RECEPTION)) {
						unset($conf->global->STOCK_CALCULATE_ON_RECEPTION);
					}
					if (!isset($conf->reception) || !is_object($conf->reception)) {
						$conf->reception = new stdClass();
					}
					if (empty($conf->reception->dir_output)) {
						$conf->reception->dir_output = DOL_DATA_ROOT.'/reception';
					}
					if (empty($conf->reception->multidir_output)) {
						$conf->reception->multidir_output = array($conf->entity => $conf->reception->dir_output);
					}
					$nbRec = 0;
					foreach ($validatedSupplierOrderIds as $soid) {
						if ($nbRec >= self::RECEPTION_COUNT) {
							break;
						}
						$scmd = new CommandeFournisseur($this->db);
						if ($scmd->fetch($soid) <= 0) {
							continue;
						}
						$scmd->fetch_lines();
						if (empty($scmd->lines)) {
							continue;
						}
						$rec = new Reception($this->db);
						$rec->origin        = 'commande_fournisseur';
						$rec->origin_id     = (int) $scmd->id;
						$rec->socid         = (int) $scmd->socid;
						$rec->date_delivery = dol_now();
						$rec->note_private  = '[DEMO-DPKD] Réception de démonstration';
						$rec->entity        = $conf->entity;
						// Under PHP 8.2 strict, Reception::create() reads many
						// optional header props; initialize to avoid fatal
						// "Undefined property" warnings under PHPUnit.
						$rec->date_reception     = dol_now();
						$rec->ref_supplier       = '';
						$rec->fk_project         = 0;
						$rec->shipping_method_id = 0;
						$rec->tracking_number    = '';
						$rec->weight             = 0;
						$rec->trueDepth          = 0;
						$rec->trueWidth          = 0;
						$rec->trueHeight         = 0;
						$rec->weight_units       = 0;
						$rec->size_units         = 0;
						$rec->model_pdf          = '';
						$rec->fk_incoterms       = 0;
						$rec->location_incoterms = '';
						$anyLine = false;
						foreach ($scmd->lines as $line) {
							// addline returns the line index: >=0 is success,
							// < 0 is an error (unlike Expedition which returns >0).
							if ($rec->addline(0, (int) $line->id, (float) $line->qty) >= 0) {
								$anyLine = true;
							}
						}
						if (!$anyLine) {
							continue;
						}
						$rRes = $rec->create($user);
						if ($rRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Réception (commande fournisseur '.$soid.') : '.$this->collectErrors($rec);
							dol_syslog('DPK demo: reception creation failed (supplier order '.$soid.')', LOG_WARNING);
							continue;
						}
						// Receptions are left as drafts: Reception::valid() re-reads
						// the origin supplier-order lines and dereferences
						// $line->product->label, which is null when the source line
						// carries no product label (deprecated) -- fatal under PHP
						// 8.2 strict. Draft receptions are valid demo data; the E2E
						// suite covers the validated state (warnings non-fatal there).
						$counts['receptions']++;
						$nbRec++;
					}
					$this->results[] = '[OK] '.$counts['receptions'].' réceptions créées';
				} else {
					$this->results[] = '[WARN] Réceptions non générées : aucune commande fournisseur validée';
					dol_syslog('DPK demo: receptions skipped (no validated supplier orders)', LOG_WARNING);
				}

				// 14. Projects (projets) --------------------------------
				// Header-only objects (no product lines). Project::create()
				// requires a non-empty ref -- set a deterministic one.
				// setValid() moves statut 0 -> 1.
				if (!empty($validCustomers)) {
					if (!isset($conf->project) || !is_object($conf->project)) {
						$conf->project = new stdClass();
					}
					if (empty($conf->project->dir_output)) {
						$conf->project->dir_output = DOL_DATA_ROOT.'/project';
					}
					$nbCustForProj = count($validCustomers);
					for ($i = 0; $i < self::PROJECT_COUNT; $i++) {
						$proj = new Project($this->db);
						$proj->ref          = 'PJ-DPKD-'.$conf->entity.'-'.($i + 1);
						$proj->title        = 'Projet de démonstration #'.($i + 1);
						$proj->socid        = $validCustomers[$i % $nbCustForProj];
						$proj->date_start   = dol_now();
						$proj->note_private = '[DEMO-DPKD] Projet de démonstration';
						$proj->statut       = 0;
						$proj->entity       = $conf->entity;
						$prRes = $proj->create($user);
						if ($prRes <= 0) {
							$warnings++;
							$this->results[] = '[WARN] Projet #'.($i + 1).' : '.$this->collectErrors($proj);
							dol_syslog('DPK demo: project creation failed (#'.($i + 1).')', LOG_WARNING);
							continue;
						}
						// Validate every other project (mix of draft/validated).
						if ($i % 2 === 0) {
							if ($proj->setValid($user) <= 0) {
								$warnings++;
								$this->results[] = '[WARN] Validation projet #'.($i + 1).' : '.$this->collectErrors($proj);
								dol_syslog('DPK demo: project validation failed (#'.($i + 1).')', LOG_WARNING);
							}
						}
						$counts['projects']++;
					}
					$this->results[] = '[OK] '.$counts['projects'].' projets créés';
				} else {
					$this->results[] = '[WARN] Projets non générés : clients indisponibles';
					dol_syslog('DPK demo: projects skipped (no customers)', LOG_WARNING);
				}
			}
		}

		if ($error) {
			$this->db->rollback();
			$summary = 'rolled_back';
			$this->results[] = '[ERREUR] '.$error.' erreur(s) critique(s) - données annulées';
		} else {
			dolibarr_set_const($this->db, self::ROOT_CONST, (string) $rootId, 'chaine', 0, '', $conf->entity);
			$this->db->commit();
			$summary = 'generated';

			if ($copyImages) {
				$imgOk = 0;
				foreach ($imageTasks as $task) {
					$vp = new Product($this->db);
					if ($vp->fetch($task['id']) > 0 && $this->copyProductImage($vp, $task['src'])) {
						$imgOk++;
					}
				}
				$counts['images'] = $imgOk;
				$this->results[] = '[OK] Images copiées : '.$imgOk.'/'.count($imageTasks);
			}
		}

		return array(
			'error'    => $error,
			'warnings' => $warnings,
			'results'  => $this->results,
			'summary'  => $summary,
			'rootId'   => (int) $rootId,
			'counts'   => $counts,
		);
	}

	/**
	 * Purge the whole demo dataset (reverse dependency order).
	 *
	 * @param  User $user User performing the action
	 * @return array{results:string[],nbProd:int,nbCat:int,nbSoc:int,nbContact:int,nbProp:int,nbOrder:int,nbInvoice:int,nbSupplierOrder:int,nbSupplierInvoice:int,nbSupplierProposal:int,nbAgenda:int,nbShipment:int,nbReception:int,nbProject:int}
	 */
	public function purge($user)
	{
		global $conf;

		$this->results = array();
		$this->db->begin();
		$nbProd = 0;
		$nbCat  = 0;
		$nbSoc  = 0;
		$nbContact = 0;
		$nbProp = 0;
		$nbOrder = 0;
		$nbInvoice = 0;
		$nbSupplierOrder = 0;
		$nbSupplierInvoice = 0;
		$nbSupplierProposal = 0;
		$nbAgenda = 0;
		$nbShipment = 0;
		$nbReception = 0;
		$nbProject = 0;

		// Resolve demo third-party ids (client + supplier prefixes).
		$socIds = array();
		$sqlS = "SELECT rowid FROM ".MAIN_DB_PREFIX."societe";
		$sqlS .= " WHERE (code_client LIKE '".$this->db->escape(self::CLIENT_CODE_PREFIX)."%'";
		$sqlS .= " OR code_fournisseur LIKE '".$this->db->escape(self::SUPPLIER_CODE_PREFIX)."%')";
		$sqlS .= " AND entity IN (".getEntity('societe').")";
		$resS = $this->db->query($sqlS);
		if ($resS) {
			while ($objS = $this->db->fetch_object($resS)) {
				$socIds[] = (int) $objS->rowid;
			}
		}

		// 0. Proposals (devis) of demo third parties. Must go before products:
		// a product referenced by a proposal line cannot be deleted (Dolibarr
		// Product::delete() refuses a used product), and before societes (FK).
		if (!empty($socIds)) {
			$inSoc = implode(',', array_map('intval', $socIds));
			$sqlPr = "SELECT rowid FROM ".MAIN_DB_PREFIX."propal";
			$sqlPr .= " WHERE fk_soc IN (".$inSoc.") AND entity IN (".getEntity('propal').")";
			$resPr = $this->db->query($sqlPr);
			if ($resPr) {
				while ($objPr = $this->db->fetch_object($resPr)) {
					$propal = new Propal($this->db);
					if ($propal->fetch($objPr->rowid) > 0 && $propal->delete($user) > 0) {
						$nbProp++;
					}
				}
			}
		}

		// 0a. Shipments (expeditions) of demo orders. Must go BEFORE orders: a
		// shipped/linked order cannot be freely deleted. Purge by note marker;
		// Expedition::delete($notrigger, $also_update_stock) uses the global $user.
		$sqlSh = "SELECT rowid FROM ".MAIN_DB_PREFIX."expedition";
		$sqlSh .= " WHERE note_private LIKE '%DEMO-DPKD%' AND entity IN (".getEntity('expedition').")";
		$resSh = $this->db->query($sqlSh);
		if ($resSh) {
			while ($objSh = $this->db->fetch_object($resSh)) {
				$exp = new Expedition($this->db);
				if ($exp->fetch($objSh->rowid) > 0 && $exp->delete(1, false) > 0) {
					$nbShipment++;
				}
			}
		}

		// 0b. Orders (commandes) of demo third parties. Same reasoning as
		// proposals: before products (a used product cannot be deleted) and
		// before societes (FK).
		if (!empty($socIds)) {
			$inSocOrders = implode(',', array_map('intval', $socIds));
			$sqlOr = "SELECT rowid FROM ".MAIN_DB_PREFIX."commande";
			$sqlOr .= " WHERE fk_soc IN (".$inSocOrders.") AND entity IN (".getEntity('commande').")";
			$resOr = $this->db->query($sqlOr);
			if ($resOr) {
				while ($objOr = $this->db->fetch_object($resOr)) {
					$cmd = new Commande($this->db);
					if ($cmd->fetch($objOr->rowid) > 0 && $cmd->delete($user) > 0) {
						$nbOrder++;
					}
				}
			}
		}

		// 0b2. Customer invoices (factures) of demo third parties. Before
		// products (a used product cannot be deleted) and societes (FK). A
		// validated invoice is normally protected from deletion (accounting
		// integrity); allow it for the demo purge.
		if (!empty($socIds)) {
			$prevCanRemove = isset($conf->global->INVOICE_CAN_ALWAYS_BE_REMOVED) ? $conf->global->INVOICE_CAN_ALWAYS_BE_REMOVED : null;
			$conf->global->INVOICE_CAN_ALWAYS_BE_REMOVED = 1;
			$inSocInv = implode(',', array_map('intval', $socIds));
			$sqlIn = "SELECT rowid FROM ".MAIN_DB_PREFIX."facture";
			$sqlIn .= " WHERE fk_soc IN (".$inSocInv.") AND entity IN (".getEntity('facture').")";
			$resIn = $this->db->query($sqlIn);
			if ($resIn) {
				while ($objIn = $this->db->fetch_object($resIn)) {
					$fac = new Facture($this->db);
					if ($fac->fetch($objIn->rowid) > 0 && $fac->delete($user) > 0) {
						$nbInvoice++;
					}
				}
			}
			if ($prevCanRemove === null) {
				unset($conf->global->INVOICE_CAN_ALWAYS_BE_REMOVED);
			} else {
				$conf->global->INVOICE_CAN_ALWAYS_BE_REMOVED = $prevCanRemove;
			}
		}

		// 0c0. Receptions of demo supplier orders. Must go BEFORE supplier
		// orders (a received/linked supplier order cannot be freely deleted).
		// Raw SQL delete (no fetch): Reception::fetch()/delete() call
		// fetch_lines() which dereferences $line->product->label -- null when
		// the origin line has no product label -- fatal under PHP 8.2 strict.
		$sqlRc = "SELECT rowid FROM ".MAIN_DB_PREFIX."reception";
		$sqlRc .= " WHERE note_private LIKE '%DEMO-DPKD%' AND entity IN (".getEntity('reception').")";
		$resRc = $this->db->query($sqlRc);
		if ($resRc) {
			$recIds = array();
			while ($objRc = $this->db->fetch_object($resRc)) {
				$recIds[] = (int) $objRc->rowid;
			}
			if (!empty($recIds)) {
				$inRc = implode(',', $recIds);
				$this->db->query("DELETE FROM ".MAIN_DB_PREFIX."commande_fournisseur_dispatch WHERE fk_reception IN (".$inRc.")");
				$this->db->query("DELETE FROM ".MAIN_DB_PREFIX."reception_extrafields WHERE fk_object IN (".$inRc.")");
				$this->db->query("DELETE FROM ".MAIN_DB_PREFIX."element_element WHERE (targettype = 'reception' AND fk_target IN (".$inRc.")) OR (sourcetype = 'reception' AND fk_source IN (".$inRc."))");
				$this->db->query("DELETE FROM ".MAIN_DB_PREFIX."reception WHERE rowid IN (".$inRc.")");
				$nbReception = count($recIds);
			}
		}

		// 0c. Supplier orders (commandes fournisseur) of demo third parties.
		// fk_soc is the supplier, which is part of $socIds (SU-DPKD- prefix).
		// Before products (a used product cannot be deleted) and societes (FK).
		if (!empty($socIds)) {
			$inSocSup = implode(',', array_map('intval', $socIds));
			$sqlSo = "SELECT rowid FROM ".MAIN_DB_PREFIX."commande_fournisseur";
			$sqlSo .= " WHERE fk_soc IN (".$inSocSup.") AND entity IN (".getEntity('commande_fournisseur').")";
			$resSo = $this->db->query($sqlSo);
			if ($resSo) {
				while ($objSo = $this->db->fetch_object($resSo)) {
					$scmd = new CommandeFournisseur($this->db);
					if ($scmd->fetch($objSo->rowid) > 0 && $scmd->delete($user) > 0) {
						$nbSupplierOrder++;
					}
				}
			}
		}

		// 0d. Supplier invoices (factures fournisseur) of demo third parties.
		// fk_soc is the supplier (SU-DPKD- prefix), part of $socIds. Before
		// products (a used product cannot be deleted) and societes (FK).
		if (!empty($socIds)) {
			$inSocSupInv = implode(',', array_map('intval', $socIds));
			$sqlSfi = "SELECT rowid FROM ".MAIN_DB_PREFIX."facture_fourn";
			$sqlSfi .= " WHERE fk_soc IN (".$inSocSupInv.") AND entity IN (".getEntity('facture_fourn').")";
			$resSfi = $this->db->query($sqlSfi);
			if ($resSfi) {
				while ($objSfi = $this->db->fetch_object($resSfi)) {
					$sfac = new FactureFournisseur($this->db);
					if ($sfac->fetch($objSfi->rowid) > 0 && $sfac->delete($user) > 0) {
						$nbSupplierInvoice++;
					}
				}
			}
		}

		// 0e. Supplier price requests (demandes de prix) of demo third parties.
		// fk_soc is the supplier, part of $socIds. Before products / societes.
		if (!empty($socIds)) {
			$inSocSp = implode(',', array_map('intval', $socIds));
			$sqlSp = "SELECT rowid FROM ".MAIN_DB_PREFIX."supplier_proposal";
			$sqlSp .= " WHERE fk_soc IN (".$inSocSp.") AND entity IN (".getEntity('supplier_proposal').")";
			$resSp = $this->db->query($sqlSp);
			if ($resSp) {
				while ($objSp = $this->db->fetch_object($resSp)) {
					$sp = new SupplierProposal($this->db);
					if ($sp->fetch($objSp->rowid) > 0 && $sp->delete($user) > 0) {
						$nbSupplierProposal++;
					}
				}
			}
		}

		// 0f. Agenda events (ActionComm) tagged as demo. fk_soc is optional so
		// the note marker (stored in the `note` column) is authoritative. Before
		// societes (FK). The actioncomm PK column is `id`, not `rowid`.
		$sqlAg = "SELECT id FROM ".MAIN_DB_PREFIX."actioncomm";
		$sqlAg .= " WHERE note LIKE '%DEMO-DPKD%' AND entity IN (".getEntity('agenda').")";
		$resAg = $this->db->query($sqlAg);
		if ($resAg) {
			while ($objAg = $this->db->fetch_object($resAg)) {
				$evt = new ActionComm($this->db);
				// delete($notrigger=1): skip triggers during purge.
				if ($evt->fetch($objAg->id) > 0 && $evt->delete(1) > 0) {
					$nbAgenda++;
				}
			}
		}

		// 0g. Projects (projets) tagged as demo. Before societes (fk_soc).
		// Purge by note marker; Project::delete($user) cascades tasks/links.
		$sqlPj = "SELECT rowid FROM ".MAIN_DB_PREFIX."projet";
		$sqlPj .= " WHERE note_private LIKE '%DEMO-DPKD%' AND entity IN (".getEntity('project').")";
		$resPj = $this->db->query($sqlPj);
		if ($resPj) {
			while ($objPj = $this->db->fetch_object($resPj)) {
				$proj = new Project($this->db);
				if ($proj->fetch($objPj->rowid) > 0 && $proj->delete($user) > 0) {
					$nbProject++;
				}
			}
		}

		// 1. Contacts of demo third parties.
		foreach ($socIds as $sid) {
			$sqlC = "SELECT rowid FROM ".MAIN_DB_PREFIX."socpeople WHERE fk_soc = ".((int) $sid);
			$resC = $this->db->query($sqlC);
			if ($resC) {
				while ($objC = $this->db->fetch_object($resC)) {
					$contact = new Contact($this->db);
					// Contact::delete($notrigger) takes no $user (uses global $user
					// for its trigger); pass 1 to skip triggers during purge.
					if ($contact->fetch($objC->rowid) > 0 && $contact->delete(1) > 0) {
						$nbContact++;
					}
				}
			}
		}

		// 2. Products (by ref prefix) - also removes category links + docs.
		$sqlP = "SELECT rowid FROM ".MAIN_DB_PREFIX."product";
		$sqlP .= " WHERE ref LIKE '".$this->db->escape(self::PROD_REF_PREFIX)."%' AND entity IN (".getEntity('product').")";
		$resP = $this->db->query($sqlP);
		if ($resP) {
			while ($objP = $this->db->fetch_object($resP)) {
				$prod = new Product($this->db);
				if ($prod->fetch($objP->rowid) > 0 && $prod->delete($user) > 0) {
					$nbProd++;
				}
			}
		}

		// 3. Categories (subtree of the stored root: rayons first, then root).
		$rootId = (int) getDolGlobalString(self::ROOT_CONST, 0);
		if ($rootId > 0) {
			$sqlCat = "SELECT rowid FROM ".MAIN_DB_PREFIX."categorie WHERE fk_parent = ".((int) $rootId);
			$resCat = $this->db->query($sqlCat);
			if ($resCat) {
				while ($objCat = $this->db->fetch_object($resCat)) {
					$cat = new Categorie($this->db);
					if ($cat->fetch($objCat->rowid) > 0 && $cat->delete($user) > 0) {
						$nbCat++;
					}
				}
			}
			$rootCat = new Categorie($this->db);
			if ($rootCat->fetch($rootId) > 0 && $rootCat->delete($user) > 0) {
				$nbCat++;
			}
		}

		// 4. Third parties (clients + suppliers).
		foreach ($socIds as $sid) {
			$s = new Societe($this->db);
			if ($s->fetch($sid) > 0 && $s->delete($sid, $user) > 0) {
				$nbSoc++;
			}
		}

		dolibarr_del_const($this->db, self::ROOT_CONST, $conf->entity);
		$this->db->commit();

		$this->results[] = '[OK] Purge : '.$nbProp.' devis, '.$nbOrder.' commandes, '.$nbInvoice.' factures, '.$nbSupplierOrder.' commandes fournisseur, '.$nbSupplierInvoice.' factures fournisseur, '.$nbSupplierProposal.' demandes de prix, '.$nbAgenda.' évènements agenda, '.$nbShipment.' expéditions, '.$nbReception.' réceptions, '.$nbProject.' projets, '.$nbProd.' produits, '.$nbCat.' catégories, '.$nbSoc.' tiers, '.$nbContact.' contacts supprimés';

		return array('results' => $this->results, 'nbProd' => $nbProd, 'nbCat' => $nbCat, 'nbSoc' => $nbSoc, 'nbContact' => $nbContact, 'nbProp' => $nbProp, 'nbOrder' => $nbOrder, 'nbInvoice' => $nbInvoice, 'nbSupplierOrder' => $nbSupplierOrder, 'nbSupplierInvoice' => $nbSupplierInvoice, 'nbSupplierProposal' => $nbSupplierProposal, 'nbAgenda' => $nbAgenda, 'nbShipment' => $nbShipment, 'nbReception' => $nbReception, 'nbProject' => $nbProject);
	}
}
