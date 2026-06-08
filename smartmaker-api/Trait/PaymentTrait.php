<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
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
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace Dolipocket\Api\Trait;

/**
 * Process-wide registry used to swap the Dolibarr core payment class for a
 * mock during integration tests. PHP 8.3 deprecates direct access to static
 * trait properties so we keep the override on a regular class.
 *
 * Production keeps the defaults `\Paiement` / `\PaiementFourn`. Integration
 * tests set $customerPaymentClass / $supplierPaymentClass to mock classes so
 * the trait never touches the banking subsystem (no `addPaymentToBank()`,
 * no real journal entry).
 */
final class PaymentRegistry
{
    /** @var string Fully qualified Paiement classname (customer invoice). */
    public static $customerPaymentClass = '\\Paiement';

    /** @var string Fully qualified PaiementFourn classname (supplier invoice). */
    public static $supplierPaymentClass = '\\PaiementFourn';
}

/**
 * Generic helper shared by the customer and supplier invoice controllers to
 * record a payment against an invoice.
 *
 * Wiring expected on the consumer:
 *  - $this->mapper is the dmXxx instance.
 *  - addPayment($arr, $config) called from InvoiceController::addPayment()
 *    or SupplierInvoiceController::addPayment().
 *
 * Test injection: set PaymentRegistry::$customerPaymentClass /
 * $supplierPaymentClass at runtime to swap the Dolibarr core class for a
 * mock that captures the invoice's $amounts map without hitting the bank.
 */
trait PaymentTrait
{
    /**
     * Record a payment against the current invoice.
     *
     * Request body:
     *   - amount        (float, required, > 0)
     *   - payment_mode  (int, required) -- id of llx_c_paiement entry
     *                                      (resolved client-side via sellist)
     *   - payment_date  (int|string, optional, default now) -- ms / seconds / ISO
     *   - ref           (string, optional) -- payment reference (cheque number, ...)
     *   - fk_account    (int, optional) -- id of bank account (llx_bank_account)
     *   - note          (string, optional, TYPE_RAW)
     *
     * @param array|null $arr     Route params (id) and request body
     * @param array      $config  Wiring for the calling controller:
     *                            - invoiceClass     : '\\Facture' or '\\FactureFournisseur'
     *                            - paymentClass     : 'customer' or 'supplier' (selects
     *                                                  the PaymentRegistry slot)
     *                            - permGroup        : Dolibarr right group ('facture'
     *                                                  for customer, ['fournisseur','facture']
     *                                                  for supplier)
     *                            - permAction       : right action ('paiement_creer' for
     *                                                  customer; sub-segment varies for
     *                                                  supplier -- handled inside)
     *                            - logTag           : 'InvoiceController' or 'SupplierInvoiceController'
     *                            - notFoundLabel    : 'Invoice' / 'Supplier invoice'
     *                            - currencyDefault  : default currency code if conf empty
     * @return array              [ resultBody, httpCode ]
     */
    public function addPayment($arr, array $config)
    {
        global $db, $user, $conf;

        $logTag = isset($config['logTag']) ? (string) $config['logTag'] : 'Controller';
        $invoiceClass = isset($config['invoiceClass']) ? (string) $config['invoiceClass'] : null;
        $paymentKind = isset($config['paymentClass']) ? (string) $config['paymentClass'] : '';
        $permGroup = isset($config['permGroup']) ? $config['permGroup'] : null;
        $notFoundLabel = isset($config['notFoundLabel']) ? (string) $config['notFoundLabel'] : 'Invoice';

        if ($invoiceClass === null || $permGroup === null || $paymentKind === '') {
            dol_syslog("DPK {$logTag}::addPayment misconfigured (invoiceClass/paymentClass/permGroup missing)", LOG_ERR);
            return [['error' => 'Server misconfigured'], 500];
        }

        // Permission check (Dolibarr conventions: customer -> 'facture'/'paiement'/'creer';
        // supplier -> 'fournisseur'/'facture'/'creer' since there is no
        // separate paiement sub-right in core).
        $hasRight = false;
        if ($paymentKind === 'customer') {
            $hasRight = $user->hasRight('facture', 'paiement', 'creer')
                || ($user->admin ? true : false);
        } else {
            // Supplier: core ships only fournisseur/facture/{lire,creer,...}.
            // We accept the 'creer' right which is what the Dolibarr fourn
            // payment card itself checks.
            $hasRight = $user->hasRight('fournisseur', 'facture', 'creer')
                || ($user->admin ? true : false);
        }
        if (!$hasRight) {
            dol_syslog("DPK {$logTag}::addPayment forbidden user=" . $user->id, LOG_WARNING);
            return [['error' => 'Forbidden'], 403];
        }

        $id = isset($arr['id']) ? (int) $arr['id'] : 0;
        if ($id <= 0) {
            dol_syslog("DPK {$logTag}::addPayment missing id", LOG_WARNING);
            return [['error' => $notFoundLabel . ' id is required'], 400];
        }

        // Amount: required, > 0.
        // (We follow Dolibarr's standard payment card which refuses 0 and
        // negative; credit notes are recorded as separate invoice types,
        // not as negative payments.)
        if (!isset($arr['amount']) || $arr['amount'] === '' || $arr['amount'] === null) {
            dol_syslog("DPK {$logTag}::addPayment missing amount", LOG_WARNING);
            return [['error' => 'amount is required'], 400];
        }
        $amount = (float) $arr['amount'];
        if (!is_finite($amount) || $amount <= 0) {
            dol_syslog("DPK {$logTag}::addPayment invalid amount '" . var_export($arr['amount'], true) . "'", LOG_WARNING);
            return [['error' => 'amount must be a positive number'], 400];
        }

        $paymentMode = isset($arr['payment_mode']) ? (int) $arr['payment_mode'] : 0;
        if ($paymentMode <= 0) {
            dol_syslog("DPK {$logTag}::addPayment missing payment_mode", LOG_WARNING);
            return [['error' => 'payment_mode is required'], 400];
        }

        // Fetch the invoice and check it is in the proper state.
        $invoice = new $invoiceClass($db);
        if ($invoice->fetch($id) <= 0) {
            dol_syslog("DPK {$logTag}::addPayment invoice not found id=" . $id, LOG_WARNING);
            return [['error' => $notFoundLabel . ' not found'], 404];
        }

        // Dolibarr core forbids payments on draft invoices: a draft has no
        // ref nor immutable amount, so the bank entry would be inconsistent.
        // Mirror this contract here -- the front pill ("Brouillon") already
        // hides the action button but we double-check at the API boundary.
        $statut = (int) ($invoice->statut ?? 0);
        if ($statut === 0) {
            dol_syslog("DPK {$logTag}::addPayment cannot pay a draft invoice id=" . $id, LOG_WARNING);
            return [['error' => 'Cannot record a payment on a draft invoice'], 400];
        }
        // Already fully paid -- block to avoid orphan duplicate payments.
        // The user can still record a payment via Dolibarr core directly
        // (e.g. for an excess) but for the standard PWA flow this is an error.
        if ((int) ($invoice->paye ?? 0) === 1) {
            dol_syslog("DPK {$logTag}::addPayment invoice already paid id=" . $id, LOG_WARNING);
            return [['error' => 'Invoice is already fully paid'], 400];
        }

        // Refuse overpayments: amount must be <= remain-to-pay so we never
        // mark the invoice paid for more than its total_ttc. Standard
        // Dolibarr policy.
        $totalTtc = (float) ($invoice->total_ttc ?? 0);
        $alreadyPaid = 0.0;
        if (method_exists($invoice, 'getSommePaiement')) {
            $alreadyPaid = (float) $invoice->getSommePaiement();
        }
        $remain = $totalTtc - $alreadyPaid;
        // Tolerance: a 0.01 cent rounding margin. price2num cleans this up
        // when Dolibarr saves the row.
        if ($amount > $remain + 0.005) {
            dol_syslog(
                "DPK {$logTag}::addPayment amount " . $amount . " exceeds remain " . $remain . " (id=" . $id . ")",
                LOG_WARNING
            );
            return [
                ['error' => 'Payment amount (' . $amount . ') exceeds remain to pay (' . $remain . ')'],
                400,
            ];
        }

        // Resolve the payment class via the registry (production: real
        // Dolibarr class; tests: mock).
        $paymentClass = $paymentKind === 'customer'
            ? PaymentRegistry::$customerPaymentClass
            : PaymentRegistry::$supplierPaymentClass;

        if (!class_exists($paymentClass)) {
            // Defensive load when the prepend did not pull the class in (e.g.
            // some lazy contexts). Both classes live in core Dolibarr.
            if ($paymentKind === 'customer') {
                require_once DOL_DOCUMENT_ROOT . '/compta/paiement/class/paiement.class.php';
            } else {
                require_once DOL_DOCUMENT_ROOT . '/fourn/class/paiementfourn.class.php';
            }
        }

        // Build the payment object. Dolibarr expects:
        //   $payment->datepaye          : UNIX timestamp
        //   $payment->paiementid        : id from llx_c_paiement
        //   $payment->amounts[$facid]   : dispatch (one invoice per call here)
        //   $payment->num_payment       : free-text ref (cheque number, virement label)
        //   $payment->note_private      : free-text note
        //   $payment->fk_account        : optional bank account id (for addPaymentToBank())
        $paymentDate = self::normalizeTimestamp($arr['payment_date'] ?? null);
        if ($paymentDate === null) {
            $paymentDate = dol_now();
        }

        $payment = new $paymentClass($db);
        $payment->datepaye = $paymentDate;
        $payment->paiementid = $paymentMode;
        $payment->amounts = [$id => $amount];
        // multicurrency_amounts must exist (Paiement::create iterates it
        // even when we are in mono-currency). Mirror $amounts.
        $payment->multicurrency_amounts = [$id => $amount];
        // Each invoice in $amounts must have a corresponding currency
        // entry; we let core fall back to $conf->currency when empty.
        $payment->multicurrency_code = [$id => (string) ($conf->currency ?? 'EUR')];
        $payment->multicurrency_tx = [$id => 1.0];
        $payment->num_payment = isset($arr['ref']) ? (string) $arr['ref'] : '';
        // Map note to note_private (private notes are the convention for
        // payment metadata in Dolibarr core -- not the invoice note).
        $payment->note_private = isset($arr['note']) ? (string) $arr['note'] : '';
        $payment->note = $payment->note_private;
        $fkAccount = isset($arr['fk_account']) ? (int) $arr['fk_account'] : 0;
        if ($fkAccount > 0) {
            $payment->fk_account = $fkAccount;
        }

        // $closepaidinvoices=1 instructs Dolibarr core to flip llx_facture.paye
        // (resp. llx_facture_fourn.paye) to 1 when the running total reaches
        // total_ttc. We rely on this rather than rolling our own setPaid()
        // call to stay aligned with what the standard payment card does.
        $resCreate = $payment->create($user, 1);
        if ($resCreate <= 0) {
            $err = $payment->error !== '' ? $payment->error : 'Failed to create payment';
            dol_syslog("DPK {$logTag}::addPayment create() failed: " . $err, LOG_ERR);
            return [['error' => 'Failed to create payment: ' . $err], 500];
        }
        $paymentId = (int) $resCreate;

        // Refetch the invoice so the response reflects the new paye flag and
        // remain-to-pay. We also surface the freshly-created payment id so
        // the front can navigate to the payment card if needed.
        $invoice->fetch($id);
        if (method_exists($invoice, 'fetch_lines')) {
            $invoice->fetch_lines();
        }
        $newAlreadyPaid = (float) $invoice->getSommePaiement();
        $newRemain = $totalTtc - $newAlreadyPaid;

        dol_syslog(
            "DPK {$logTag}::addPayment ok id=" . $id . " amount=" . $amount
                . " payment_id=" . $paymentId . " remain=" . $newRemain,
            LOG_INFO
        );

        return [
            [
                'ok'           => true,
                'payment_id'   => $paymentId,
                'invoice_id'   => $id,
                'amount'       => $amount,
                'total_paid'   => $newAlreadyPaid,
                'remain_to_pay' => $newRemain,
                'paye'         => (int) ($invoice->paye ?? 0),
                'invoice'      => $this->mapper->exportMappedData($invoice),
            ],
            201,
        ];
    }
}
