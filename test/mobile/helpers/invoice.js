/**
 * test/mobile/helpers/invoice.js
 *
 * Wrappers around test/mobile/backend/invoice-actions.php used by the invoice
 * lifecycle spec. Kept separate from helpers/admin.js so the invoice E2E work
 * never collides with concurrent edits to the shared admin helper.
 *
 * Each wrapper spawns `php invoice-actions.php <subcommand> <args...>` and
 * parses the LAST `{...}` block from stdout (Dolibarr can prefix non-fatal
 * warnings without a newline, so we extract robustly via regex).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../backend/invoice-actions.php');

function parseLastJson(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        const candidates = [...raw.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]);
        for (let i = candidates.length - 1; i >= 0; i--) {
            try {
                return JSON.parse(candidates[i]);
            } catch {
                // try next
            }
        }
    }
    throw new Error(`No JSON found in stdout (first 400 chars): ${raw.slice(0, 400)}`);
}

function runInvoice(subcommand, args = []) {
    const result = spawnSync('php', [SCRIPT, subcommand, ...args], { encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(
            `invoice-actions ${subcommand} failed (code=${result.status})\n` +
                `stdout: ${result.stdout}\nstderr: ${result.stderr}`
        );
    }
    return parseLastJson(result.stdout);
}

/**
 * Seed <count> draft invoices (each with one product line) plus their shared
 * client thirdparty and product.
 *
 * @param {number} entity
 * @param {number} count
 * @returns {{ok:boolean, socid:number, productId:number, invoices:{id:number, ref:string}[], error?:string}}
 */
export function seedInvoices(entity, count) {
    return runInvoice('seed-invoices', [String(entity), String(count)]);
}

/**
 * Delete a Facture row (teardown safety net).
 *
 * @param {number} entity
 * @param {number} invoiceId
 * @returns {{ok:boolean, deleted:number}}
 */
export function deleteInvoice(entity, invoiceId) {
    return runInvoice('delete-invoice', [String(entity), String(invoiceId)]);
}

/**
 * Count Facture rows for the entity.
 *
 * @param {number} entity
 * @returns {{ok:boolean, count:number}}
 */
export function countInvoices(entity) {
    return runInvoice('count-invoices', [String(entity)]);
}

/**
 * Snapshot an invoice for spec-side assertions (status, paye, pdf, totals).
 *
 * @param {number} entity
 * @param {number} invoiceId
 * @returns {{ok:boolean, statut:number, paye:number, ref:string, lastMainDoc:string, totalTtc:number, nbLines:number}}
 */
export function getInvoice(entity, invoiceId) {
    return runInvoice('get-invoice', [String(entity), String(invoiceId)]);
}
