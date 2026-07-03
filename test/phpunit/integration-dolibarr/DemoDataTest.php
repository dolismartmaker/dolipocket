<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

/**
 * Integration tests for the Dolipocket demo data generator/purger.
 *
 * Runs the real DolipocketDemoData::generate()/purge() against the SQLite
 * Dolibarr harness and asserts the dataset is created and removed correctly.
 * Images are not copied in tests ($copyImages = false) to stay headless.
 */
class DemoDataTest extends DolibarrRealTestCase
{
    /** @var \DolipocketDemoData */
    private $demo;

    protected function setUp(): void
    {
        parent::setUp();

        // Enable the modules whose valid()/validate() gate on isModEnabled()
        // (via User::hasRight, which returns 0 when the module is off). Real
        // Dolipocket tenants get these from EntityProvisioner::activateDefaultModules;
        // the bare integration base install does not enable them all, so the
        // supplier-order / shipment / reception / supplier-proposal validations
        // would fail "NotAuthorized" without this.
        global $conf;
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = [];
        }
        foreach (['fournisseur', 'expedition', 'reception', 'supplier_proposal', 'projet', 'stock'] as $m) {
            $conf->modules[$m] = $m;
        }

        $root = dirname(__DIR__, 3);
        require_once $root . '/class/demodata.class.php';

        // Explicit paths so the test does not depend on dol_buildpath resolution.
        $this->demo = new \DolipocketDemoData(
            $this->db,
            $root . '/demo/data/catalog.php',
            $root . '/demo/img'
        );

        // Purge deletes standard Dolibarr objects; grant the deletion rights a
        // real admin operator would have (the harness user ships only a subset).
        $u = $this->testUser;
        foreach (['produit', 'service', 'societe', 'categorie'] as $mod) {
            if (!isset($u->rights->$mod) || !is_object($u->rights->$mod)) {
                $u->rights->$mod = new \stdClass();
            }
            $u->rights->$mod->supprimer = 1;
        }
        // Proposals + orders: create/validate/delete rights for the demo
        // devis / commandes sections.
        foreach (['propal', 'commande', 'facture'] as $mod) {
            if (!isset($u->rights->$mod) || !is_object($u->rights->$mod)) {
                $u->rights->$mod = new \stdClass();
            }
            $u->rights->$mod->creer = 1;
            $u->rights->$mod->valider = 1;
            $u->rights->$mod->supprimer = 1;
        }
        // Supplier orders: CommandeFournisseur::valid()/delete() gate on
        // fournisseur->commande rights (nested two levels).
        if (!isset($u->rights->fournisseur) || !is_object($u->rights->fournisseur)) {
            $u->rights->fournisseur = new \stdClass();
        }
        if (!isset($u->rights->fournisseur->commande) || !is_object($u->rights->fournisseur->commande)) {
            $u->rights->fournisseur->commande = new \stdClass();
        }
        $u->rights->fournisseur->commande->creer = 1;
        $u->rights->fournisseur->commande->valider = 1;
        $u->rights->fournisseur->commande->supprimer = 1;
        // Supplier invoices: FactureFournisseur gates on fournisseur->facture.
        if (!isset($u->rights->fournisseur->facture) || !is_object($u->rights->fournisseur->facture)) {
            $u->rights->fournisseur->facture = new \stdClass();
        }
        $u->rights->fournisseur->facture->creer = 1;
        $u->rights->fournisseur->facture->valider = 1;
        $u->rights->fournisseur->facture->supprimer = 1;
        // Supplier price requests: SupplierProposal gates on supplier_proposal.
        if (!isset($u->rights->supplier_proposal) || !is_object($u->rights->supplier_proposal)) {
            $u->rights->supplier_proposal = new \stdClass();
        }
        $u->rights->supplier_proposal->creer = 1;
        $u->rights->supplier_proposal->valider = 1;
        $u->rights->supplier_proposal->supprimer = 1;
        // Agenda: ActionComm create/delete gate on agenda->my/allactions.
        if (!isset($u->rights->agenda) || !is_object($u->rights->agenda)) {
            $u->rights->agenda = new \stdClass();
        }
        foreach (['myactions', 'allactions'] as $scope) {
            if (!isset($u->rights->agenda->$scope) || !is_object($u->rights->agenda->$scope)) {
                $u->rights->agenda->$scope = new \stdClass();
            }
            $u->rights->agenda->$scope->create = 1;
            $u->rights->agenda->$scope->read = 1;
            $u->rights->agenda->$scope->delete = 1;
        }
        // Shipments + receptions: Expedition / Reception gate on expedition /
        // reception rights.
        foreach (['expedition', 'reception'] as $mod) {
            if (!isset($u->rights->$mod) || !is_object($u->rights->$mod)) {
                $u->rights->$mod = new \stdClass();
            }
            $u->rights->$mod->lire = 1;
            $u->rights->$mod->creer = 1;
            $u->rights->$mod->valider = 1;
            $u->rights->$mod->supprimer = 1;
        }
        // Projects: Project::create()/setValid()/delete() gate on projet rights
        // (both flat and the 'all' scope via restrictedProjectArea()).
        if (!isset($u->rights->projet) || !is_object($u->rights->projet)) {
            $u->rights->projet = new \stdClass();
        }
        $u->rights->projet->lire = 1;
        $u->rights->projet->creer = 1;
        $u->rights->projet->supprimer = 1;
        if (!isset($u->rights->projet->all) || !is_object($u->rights->projet->all)) {
            $u->rights->projet->all = new \stdClass();
        }
        $u->rights->projet->all->lire = 1;
        $u->rights->projet->all->creer = 1;
        $u->rights->projet->all->supprimer = 1;

        // Stock: Entrepot / MouvementStock create + delete for the demo
        // warehouses and initial stock movements.
        if (!isset($u->rights->stock) || !is_object($u->rights->stock)) {
            $u->rights->stock = new \stdClass();
        }
        $u->rights->stock->lire = 1;
        $u->rights->stock->creer = 1;
        $u->rights->stock->supprimer = 1;
        if (!isset($u->rights->stock->mouvement) || !is_object($u->rights->stock->mouvement)) {
            $u->rights->stock->mouvement = new \stdClass();
        }
        $u->rights->stock->mouvement->creer = 1;

        // Ensure a clean slate (previous test data or a leftover install).
        $this->demo->purge($this->testUser);
    }

    protected function tearDown(): void
    {
        // Never leave demo data behind for the next test.
        $this->demo->purge($this->testUser);
    }

    /**
     * Count rows matching a raw WHERE clause.
     */
    private function countRows(string $table, string $where): int
    {
        $sql = "SELECT COUNT(*) as nb FROM " . MAIN_DB_PREFIX . $table . " WHERE " . $where;
        $resql = $this->db->query($sql);
        $this->assertNotFalse($resql, "Count query failed on $table: " . $this->db->lasterror());
        $obj = $this->db->fetch_object($resql);
        return (int) $obj->nb;
    }

    public function testGenerateCreatesFullDataset(): void
    {
        $out = $this->demo->generate($this->testUser, false);

        // No fatal error, dataset reported generated.
        $this->assertSame(0, $out['error'], "Fatal errors: " . implode(' | ', $out['results']));
        $this->assertSame('generated', $out['summary']);
        $this->assertGreaterThan(0, $out['rootId']);

        // Reported counts.
        $this->assertSame(4, $out['counts']['rayons']);
        $this->assertSame(12, $out['counts']['products']);
        $this->assertSame(10, $out['counts']['customers']);
        $this->assertSame(5, $out['counts']['suppliers']);
        $this->assertSame(8, $out['counts']['contacts']);
        $this->assertSame(10, $out['counts']['proposals']);
        $this->assertSame(8, $out['counts']['orders']);
        $this->assertSame(8, $out['counts']['invoices']);
        $this->assertSame(6, $out['counts']['supplier_orders']);
        $this->assertSame(6, $out['counts']['supplier_invoices']);
        $this->assertSame(6, $out['counts']['supplier_proposals']);
        $this->assertSame(8, $out['counts']['agenda']);
        $this->assertSame(4, $out['counts']['shipments']);
        $this->assertSame(3, $out['counts']['receptions']);
        $this->assertSame(6, $out['counts']['projects']);
        $this->assertSame(3, $out['counts']['warehouses']);
        $this->assertSame(12, $out['counts']['stock_movements']);
        $this->assertSame(6, $out['counts']['documents']);

        $rootId = $out['rootId'];

        // Categories: 4 rayons under the root, plus the root itself.
        $this->assertSame(4, $this->countRows('categorie', "fk_parent = " . (int) $rootId));

        // Products: 12 with the DPKD- prefix, all flagged for sale.
        $this->assertSame(12, $this->countRows('product', "ref LIKE 'DPKD-%'"));
        $this->assertSame(0, $this->countRows('product', "ref LIKE 'DPKD-%' AND tosell <> 1"));

        // Every product is linked to a category.
        $linked = $this->countRows(
            'categorie_product AS cp INNER JOIN ' . MAIN_DB_PREFIX . "product AS p ON p.rowid = cp.fk_product",
            "p.ref LIKE 'DPKD-%'"
        );
        $this->assertSame(12, $linked);

        // Third parties: 10 clients + 5 suppliers.
        $this->assertSame(10, $this->countRows('societe', "code_client LIKE 'CU-DPKD-%'"));
        $this->assertSame(5, $this->countRows('societe', "code_fournisseur LIKE 'SU-DPKD-%'"));

        // Contacts: 8, all attached to a demo client.
        $contacts = $this->countRows(
            'socpeople AS sp INNER JOIN ' . MAIN_DB_PREFIX . "societe AS s ON s.rowid = sp.fk_soc",
            "s.code_client LIKE 'CU-DPKD-%'"
        );
        $this->assertSame(8, $contacts);

        // Proposals: 10 tagged demo devis, each with product lines.
        $this->assertSame(10, $this->countRows('propal', "note_private LIKE '%DEMO-DPKD%'"));
        $lines = $this->countRows(
            'propaldet AS pd INNER JOIN ' . MAIN_DB_PREFIX . "propal AS pp ON pp.rowid = pd.fk_propal",
            "pp.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(20, $lines);

        // Orders: 8 tagged demo commandes, each with product lines.
        $this->assertSame(8, $this->countRows('commande', "note_private LIKE '%DEMO-DPKD%'"));
        $orderLines = $this->countRows(
            'commandedet AS cd INNER JOIN ' . MAIN_DB_PREFIX . "commande AS c ON c.rowid = cd.fk_commande",
            "c.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(15, $orderLines);

        // Customer invoices: 8 tagged demo factures, each with product lines.
        $this->assertSame(8, $this->countRows('facture', "note_private LIKE '%DEMO-DPKD%'"));
        $invLines = $this->countRows(
            'facturedet AS fd INNER JOIN ' . MAIN_DB_PREFIX . "facture AS f ON f.rowid = fd.fk_facture",
            "f.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(15, $invLines);

        // Supplier orders: 6 tagged demo commandes fournisseur, each with lines.
        $this->assertSame(6, $this->countRows('commande_fournisseur', "note_private LIKE '%DEMO-DPKD%'"));
        $supOrderLines = $this->countRows(
            'commande_fournisseurdet AS cfd INNER JOIN ' . MAIN_DB_PREFIX . "commande_fournisseur AS cf ON cf.rowid = cfd.fk_commande",
            "cf.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(10, $supOrderLines);

        // Supplier invoices: 6 tagged demo factures fournisseur, each with lines.
        $this->assertSame(6, $this->countRows('facture_fourn', "note_private LIKE '%DEMO-DPKD%'"));
        $supInvLines = $this->countRows(
            'facture_fourn_det AS ffd INNER JOIN ' . MAIN_DB_PREFIX . "facture_fourn AS ff ON ff.rowid = ffd.fk_facture_fourn",
            "ff.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(10, $supInvLines);

        // Supplier price requests: 6 tagged demandes de prix, each with lines.
        $this->assertSame(6, $this->countRows('supplier_proposal', "note_private LIKE '%DEMO-DPKD%'"));
        $spLines = $this->countRows(
            'supplier_proposaldet AS spd INNER JOIN ' . MAIN_DB_PREFIX . "supplier_proposal AS sp ON sp.rowid = spd.fk_supplier_proposal",
            "sp.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(10, $spLines);

        // Agenda events: 8 tagged demo events (marker stored in the `note`
        // column of llx_actioncomm; the table has no lines).
        $this->assertSame(8, $this->countRows('actioncomm', "note LIKE '%DEMO-DPKD%'"));

        // Shipments: 4 tagged demo expeditions (one per validated order), each
        // with lines copied from the origin order.
        $this->assertSame(4, $this->countRows('expedition', "note_private LIKE '%DEMO-DPKD%'"));
        $shipLines = $this->countRows(
            'expeditiondet AS ed INNER JOIN ' . MAIN_DB_PREFIX . "expedition AS e ON e.rowid = ed.fk_expedition",
            "e.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(3, $shipLines);

        // Receptions: 3 tagged demo receptions (one per validated supplier
        // order), each with dispatch lines from the origin order.
        $this->assertSame(3, $this->countRows('reception', "note_private LIKE '%DEMO-DPKD%'"));
        $recLines = $this->countRows(
            'commande_fournisseur_dispatch AS cfd INNER JOIN ' . MAIN_DB_PREFIX . "reception AS r ON r.rowid = cfd.fk_reception",
            "r.note_private LIKE '%DEMO-DPKD%'"
        );
        $this->assertGreaterThan(2, $recLines);

        // Projects: 6 tagged demo projets (header-only, no lines).
        $this->assertSame(6, $this->countRows('projet', "note_private LIKE '%DEMO-DPKD%'"));

        // Warehouses: 3 tagged demo entrepots (marker in the description).
        $this->assertSame(3, $this->countRows('entrepot', "description LIKE '%DEMO-DPKD%'"));

        // Stock movements: one "add" per demo product (marker in the label).
        $this->assertSame(12, $this->countRows('stock_mouvement', "label LIKE '%DEMO-DPKD%'"));

        // GED documents: indexed in llx_ecm_files with the demo marker.
        $this->assertSame(6, $this->countRows('ecm_files', "description LIKE '%DEMO-DPKD%'"));

        // Install marker set.
        $this->assertTrue($this->demo->isInstalled());
    }

    public function testProductPricingIsComputedFromTtc(): void
    {
        $this->demo->generate($this->testUser, false);

        // DPKD-00001 is the first product of the first rayon: Pommes Gala, 2.79 TTC at 5.5%.
        $p = $this->db->fetch_object(
            $this->db->query("SELECT price, price_ttc, tva_tx FROM " . MAIN_DB_PREFIX . "product WHERE ref = 'DPKD-00001'")
        );
        $this->assertNotNull($p, "DPKD-00001 not found");
        $this->assertEqualsWithDelta(2.79, (float) $p->price_ttc, 0.01);
        $this->assertEqualsWithDelta(5.5, (float) $p->tva_tx, 0.01);
        // HT = 2.79 / 1.055 = 2.6445...
        $this->assertEqualsWithDelta(2.6445, (float) $p->price, 0.01);
    }

    public function testGenerateTwiceIsRefused(): void
    {
        $first = $this->demo->generate($this->testUser, false);
        $this->assertSame('generated', $first['summary']);

        $second = $this->demo->generate($this->testUser, false);
        $this->assertSame('already_installed', $second['summary']);

        // Still exactly one dataset (no duplication).
        $this->assertSame(12, $this->countRows('product', "ref LIKE 'DPKD-%'"));
    }

    public function testPurgeRemovesEverything(): void
    {
        $out = $this->demo->generate($this->testUser, false);
        $rootId = $out['rootId'];

        $this->demo->purge($this->testUser);

        $this->assertSame(0, $this->countRows('propal', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('commande', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('facture', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('commande_fournisseur', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('supplier_proposal', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('actioncomm', "note LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('expedition', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('reception', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('projet', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('facture_fourn', "note_private LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('entrepot', "description LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('stock_mouvement', "label LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('ecm_files', "description LIKE '%DEMO-DPKD%'"));
        $this->assertSame(0, $this->countRows('product', "ref LIKE 'DPKD-%'"));
        $this->assertSame(0, $this->countRows('categorie', "fk_parent = " . (int) $rootId));
        $this->assertSame(0, $this->countRows('categorie', "rowid = " . (int) $rootId));
        $this->assertSame(0, $this->countRows('societe', "code_client LIKE 'CU-DPKD-%'"));
        $this->assertSame(0, $this->countRows('societe', "code_fournisseur LIKE 'SU-DPKD-%'"));
        $this->assertFalse($this->demo->isInstalled());
    }
}
