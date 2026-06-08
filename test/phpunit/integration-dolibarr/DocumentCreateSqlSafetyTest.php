<?php

namespace Dolipocket\Tests\IntegrationDolibarr;

use Dolipocket\Api\InvoiceController;
use Dolipocket\Api\OrderController;
use Dolipocket\Api\ProposalController;
use Dolipocket\Api\SupplierInvoiceController;
use Dolipocket\Api\SupplierOrderController;

/**
 * SQL-safety tests for the create() endpoint of every document controller
 * that takes a date in its body (proposal / order / invoice /
 * supplierorder / supplierinvoice).
 *
 * The bug that motivated this suite (cf 2026-05-05 prod log):
 *
 *     INSERT INTO llx_propal (..., datep, ...) VALUES (..., 'Bad value
 *     1777939200000 for date', ...)
 *     -> DB_ERROR_1292 Incorrect date value
 *
 * Root cause: the AutoForm front collects `datep` via smartcommon's Input
 * type="date" which stores the value as a JS Date.getTime() *in
 * milliseconds*. The smartmaker mapToBackend forwards the value as-is.
 * Dolibarr's Propal::$date expects a Unix timestamp in *seconds* (or a
 * string parseable by dol_print_date()). Forwarding milliseconds yielded
 * "Bad value <ms> for date" -- a literal string that ended up in the SQL
 * INSERT verbatim and crashed the DB.
 *
 * This suite calls each controller's create() with three realistic
 * payloads -- (a) seconds-since-epoch, (b) milliseconds-since-epoch,
 * (c) an ISO date string -- and asserts that none of them crashes the
 * database. The "ms" branch is the regression test for the production bug.
 */
class DocumentCreateSqlSafetyTest extends DolibarrRealTestCase
{
    /** @var int Pivot thirdparty seeded for use as fk_soc on every doc. */
    private static $socId;

    /**
     * @return array<string,array{string,array<int,array{string,?string,string}>,string,string|null}>
     * Each row: [controllerClassName, requiredRights, fkSocField, refField]
     * fkSocField is the body key the controller expects for the third party
     * id. refField is the body key for the supplier reference (when applicable).
     */
    public static function controllerProvider(): array
    {
        return [
            'proposal' => [
                ProposalController::class,
                [['propal', null, 'lire'], ['propal', null, 'creer']],
                'fk_soc',
                null,
            ],
            'order' => [
                OrderController::class,
                [['commande', null, 'lire'], ['commande', null, 'creer']],
                'fk_soc',
                null,
            ],
            'invoice' => [
                InvoiceController::class,
                [['facture', null, 'lire'], ['facture', null, 'creer']],
                'fk_soc',
                null,
            ],
            'supplierorder' => [
                SupplierOrderController::class,
                [
                    ['fournisseur', 'commande', 'lire'],
                    ['fournisseur', 'commande', 'creer'],
                    ['fournisseur', 'commande', 'create'],
                ],
                'fk_soc',
                'ref_supplier',
            ],
            'supplierinvoice' => [
                SupplierInvoiceController::class,
                [
                    ['fournisseur', 'facture', 'lire'],
                    ['fournisseur', 'facture', 'creer'],
                    ['fournisseur', 'facture', 'create'],
                ],
                'fk_soc',
                'ref_supplier',
            ],
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();

        global $user, $db;

        // Bootstrap dependencies.
        dol_include_once('/smartauth/autoload.php');
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/dmCatalogTrait.php';
        require_once dirname(__DIR__, 3) . '/smartmaker-api/Trait/PaginatedListTrait.php';
        foreach ([
            'dmProposal', 'dmOrder', 'dmInvoice', 'dmSupplierOrder', 'dmSupplierInvoice',
            'ProposalController', 'OrderController', 'InvoiceController',
            'SupplierOrderController', 'SupplierInvoiceController',
        ] as $f) {
            require_once dirname(__DIR__, 3) . '/smartmaker-api/' . $f . '.php';
        }
        require_once DOL_DOCUMENT_ROOT . '/societe/class/societe.class.php';
        require_once DOL_DOCUMENT_ROOT . '/comm/propal/class/propal.class.php';
        require_once DOL_DOCUMENT_ROOT . '/commande/class/commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/compta/facture/class/facture.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.commande.class.php';
        require_once DOL_DOCUMENT_ROOT . '/fourn/class/fournisseur.facture.class.php';

        $user->admin = 1;
        if (!isset($user->rights)) {
            $user->rights = new \stdClass();
        }

        if (self::$socId === null) {
            $soc = new \Societe($db);
            $soc->name = 'SqlSafetyDoc-' . uniqid();
            $soc->client = 1;
            $soc->fournisseur = 1;
            $soc->status = 1;
            $r = $soc->create($user);
            if ($r <= 0) {
                $this->markTestSkipped('Failed to seed pivot Societe: ' . ($soc->error ?? 'unknown'));
            }
            self::$socId = (int) $r;
        }
    }

    /**
     * @dataProvider controllerProvider
     */
    public function testCreateAcceptsSecondsTimestamp(string $controllerClass, array $rights, string $fkSocField, ?string $refField): void
    {
        $this->grantRights($rights);
        $secs = mktime(0, 0, 0, 6, 15, 2026);

        $payload = $this->basePayload($fkSocField, $refField);
        $payload['datep']        = $secs;
        $payload['date']         = $secs;
        $payload['date_commande']= $secs;
        $payload['fin_validite'] = $secs + 86400 * 30;

        [$data, $code] = (new $controllerClass())->create($payload);

        $this->assertContains(
            $code,
            [200, 201],
            'create() with seconds-since-epoch must succeed (HTTP 200/201). Got ' . $code . ': ' . json_encode($data)
        );
    }

    /**
     * Reproduces the production crash: the front sends Date.getTime() i.e.
     * MILLISECONDS, the controller forwards them as-is, the DB rejects
     * "Bad value <ms> for date" -> 500.
     *
     * This test fails on the legacy controller and passes once the
     * controller normalises ms->s.
     *
     * @dataProvider controllerProvider
     */
    public function testCreateAcceptsMillisecondsTimestamp(string $controllerClass, array $rights, string $fkSocField, ?string $refField): void
    {
        $this->grantRights($rights);
        $ms = mktime(0, 0, 0, 6, 15, 2026) * 1000;

        $payload = $this->basePayload($fkSocField, $refField);
        $payload['datep']         = $ms;
        $payload['date']          = $ms;
        $payload['date_commande'] = $ms;
        $payload['fin_validite']  = $ms + 86400_000 * 30;

        [$data, $code] = (new $controllerClass())->create($payload);

        $this->assertContains(
            $code,
            [200, 201],
            'create() with milliseconds-since-epoch must succeed -- '
            . 'the AutoForm front sends Date.getTime() so the controller '
            . 'must normalise. Got ' . $code . ': ' . json_encode($data)
        );
    }

    /**
     * @dataProvider controllerProvider
     */
    public function testCreateAcceptsIsoDateString(string $controllerClass, array $rights, string $fkSocField, ?string $refField): void
    {
        $this->grantRights($rights);
        $iso = '2026-06-15';

        $payload = $this->basePayload($fkSocField, $refField);
        $payload['datep']         = $iso;
        $payload['date']          = $iso;
        $payload['date_commande'] = $iso;
        $payload['fin_validite']  = '2026-07-15';

        [$data, $code] = (new $controllerClass())->create($payload);

        $this->assertContains(
            $code,
            [200, 201],
            'create() with ISO yyyy-mm-dd string must succeed. Got '
            . $code . ': ' . json_encode($data)
        );
    }

    /**
     * Build a minimal but complete body that every doc create() accepts.
     */
    private function basePayload(string $fkSocField, ?string $refField): array
    {
        $payload = [
            'fk_soc'   => self::$socId,
            'socid'    => self::$socId,
        ];
        if ($refField !== null) {
            $payload[$refField] = 'TEST-' . uniqid();
        }
        return $payload;
    }

    private function grantRights(array $rights): void
    {
        global $user, $conf;

        $user->admin = 1;
        $modules = ['societe', 'propal', 'commande', 'facture', 'fournisseur', 'product', 'produit', 'service', 'stock', 'banque', 'projet'];
        if (!isset($conf->modules) || !is_array($conf->modules)) {
            $conf->modules = array();
        }
        foreach ($modules as $m) {
            $conf->modules[$m] = $m;
            if (!isset($conf->$m) || !is_object($conf->$m)) {
                $conf->$m = new \stdClass();
            }
            $conf->$m->enabled = 1;
        }

        foreach ($rights as $r) {
            [$obj, $sub, $perm] = $r;
            if (!isset($user->rights->$obj)) {
                $user->rights->$obj = new \stdClass();
            }
            $target = $user->rights->$obj;
            if ($sub !== null) {
                if (!isset($target->$sub)) {
                    $target->$sub = new \stdClass();
                }
                $target = $target->$sub;
            }
            $target->$perm = 1;
        }
    }
}
