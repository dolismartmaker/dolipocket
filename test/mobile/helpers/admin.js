/**
 * test/mobile/helpers/admin.js
 *
 * Wrappers around the CLI script test/mobile/backend/admin-actions.php that
 * lets a spec drive scripted backoffice actions (e.g. seed a third party
 * before a test, or assert post-conditions outside the UI).
 *
 * Each wrapper spawns `php admin-actions.php <subcommand> <args...>` and
 * parses the LAST `{...}` block from stdout (Dolibarr can prefix non-fatal
 * warnings without a newline, so we extract robustly via regex).
 *
 * For this first iteration the only subcommand we need is `delete-thirdparty`
 * which lets specs clean up the row they created if the UI delete path is
 * not yet implemented (or as a teardown safety net).
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../backend/admin-actions.php');

function parseLastJson(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        const candidates = [...raw.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
        for (let i = candidates.length - 1; i >= 0; i--) {
            try {
                return JSON.parse(candidates[i]);
            } catch {
                // try next
            }
        }
    }
    throw new Error(`No JSON found in stdout (first 300 chars): ${raw.slice(0, 300)}`);
}

function runAdmin(subcommand, args = []) {
    const result = spawnSync('php', [SCRIPT, subcommand, ...args], { encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(
            `admin-actions ${subcommand} failed (code=${result.status})\n` +
                `stdout: ${result.stdout}\nstderr: ${result.stderr}`
        );
    }
    return parseLastJson(result.stdout);
}

/**
 * Delete a third party by its id. Used as a teardown safety net.
 *
 * @param {number} entity
 * @param {number} socId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteThirdParty(entity, socId) {
    return runAdmin('delete-thirdparty', [String(entity), String(socId)]);
}

/**
 * Count third parties for the given entity, used for sanity-checks.
 *
 * @param {number} entity
 * @returns {{ok: boolean, count: number}}
 */
export function adminCountThirdParties(entity) {
    return runAdmin('count-thirdparties', [String(entity)]);
}

/**
 * Seed a third party (Societe) for use as a fixture in pickers / FK tests.
 *
 * @param {number} entity
 * @param {string} name
 * @returns {{ok: boolean, id?: number, error?: string}}
 */
export function adminCreateThirdParty(entity, name) {
    return runAdmin('create-thirdparty', [String(entity), String(name)]);
}

/**
 * Delete a Propal row, used as teardown safety net for proposal specs.
 *
 * @param {number} entity
 * @param {number} propId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteProposal(entity, propId) {
    return runAdmin('delete-proposal', [String(entity), String(propId)]);
}

/**
 * Seed a proposal (Propal) with one free-text line so the detail page renders
 * and a PDF has content. Pass validate=true to mint a ref and move it to the
 * validated status (required for the PDF flow).
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, error?: string}}
 */
export function adminCreateProposal(entity, socId, validate = false) {
    return runAdmin('create-proposal', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Seed a customer order (Commande) with one free-text line. Pass validate=true
 * to mint a ref and move it to the validated status.
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, error?: string}}
 */
export function adminCreateOrder(entity, socId, validate = false) {
    return runAdmin('create-order', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete a Commande row, used as teardown safety net for order specs.
 *
 * @param {number} entity
 * @param {number} ordId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteOrder(entity, ordId) {
    return runAdmin('delete-order', [String(entity), String(ordId)]);
}

/**
 * Seed a supplier (fournisseur) thirdparty for supplier-side document specs.
 *
 * @param {number} entity
 * @param {string} name
 * @returns {{ok: boolean, id?: number, error?: string}}
 */
export function adminCreateSupplier(entity, name) {
    return runAdmin('create-supplier', [String(entity), String(name)]);
}

/**
 * Seed a supplier order (CommandeFournisseur) with one free-text line. Pass
 * validate=true to mint a ref and move it to the validated status.
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, error?: string}}
 */
export function adminCreateSupplierOrder(entity, socId, validate = false) {
    return runAdmin('create-supplierorder', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete a CommandeFournisseur row, teardown safety net for supplier-order specs.
 *
 * @param {number} entity
 * @param {number} ordId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteSupplierOrder(entity, ordId) {
    return runAdmin('delete-supplierorder', [String(entity), String(ordId)]);
}

/**
 * Seed a supplier invoice (FactureFournisseur) with one free-text line. Pass
 * validate=true to mint a ref and move it to the validated status.
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, error?: string}}
 */
export function adminCreateSupplierInvoice(entity, socId, validate = false) {
    return runAdmin('create-supplierinvoice', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete a FactureFournisseur row, teardown safety net for supplier-invoice specs.
 *
 * @param {number} entity
 * @param {number} invId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteSupplierInvoice(entity, invId) {
    return runAdmin('delete-supplierinvoice', [String(entity), String(invId)]);
}

/**
 * Seed a supplier price request (SupplierProposal) with one free-text line.
 * Pass validate=true to mint a ref and move it to the validated status.
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, error?: string}}
 */
export function adminCreateSupplierProposal(entity, socId, validate = false) {
    return runAdmin('create-supplierproposal', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete a SupplierProposal row, teardown safety net for supplier-proposal specs.
 *
 * @param {number} entity
 * @param {number} spId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteSupplierProposal(entity, spId) {
    return runAdmin('delete-supplierproposal', [String(entity), String(spId)]);
}

/**
 * Seed an agenda event (ActionComm). No lines/PDF/validate: create() finalizes
 * the record in one call. socId is optional (attaches the event to a tiers).
 *
 * @param {number} entity
 * @param {number} [socId=0]
 * @returns {{ok: boolean, id?: number, label?: string, error?: string}}
 */
export function adminCreateAgendaEvent(entity, socId = 0) {
    return runAdmin('create-agendaevent', [String(entity), String(socId)]);
}

/**
 * Delete an ActionComm row, teardown safety net for agenda specs.
 *
 * @param {number} entity
 * @param {number} evtId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteAgendaEvent(entity, evtId) {
    return runAdmin('delete-agendaevent', [String(entity), String(evtId)]);
}

/**
 * Seed a shipment (Expedition): creates a validated origin order with one line,
 * then a shipment from it. Pass validate=true to validate the shipment too.
 *
 * @param {number} entity
 * @param {number} socId
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, orderId?: number, error?: string}}
 */
export function adminCreateShipment(entity, socId, validate = false) {
    return runAdmin('create-shipment', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete an Expedition row, teardown safety net for shipment specs.
 *
 * @param {number} entity
 * @param {number} shipId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteShipment(entity, shipId) {
    return runAdmin('delete-shipment', [String(entity), String(shipId)]);
}

/**
 * Seed a reception (Reception): creates a product, a validated supplier order
 * carrying that product, then a reception from it. Pass validate=true to
 * validate the reception too.
 *
 * @param {number} entity
 * @param {number} socId supplier thirdparty id
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, status?: number, orderId?: number, productId?: number, error?: string}}
 */
export function adminCreateReception(entity, socId, validate = false) {
    return runAdmin('create-reception', [String(entity), String(socId), validate ? '1' : '0']);
}

/**
 * Delete a Reception row, teardown safety net for reception specs.
 *
 * @param {number} entity
 * @param {number} recId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteReception(entity, recId) {
    return runAdmin('delete-reception', [String(entity), String(recId)]);
}

/**
 * Seed a project (Project). Header-only object. Pass validate=true to move it to
 * the validated status.
 *
 * @param {number} entity
 * @param {boolean} [validate=false]
 * @returns {{ok: boolean, id?: number, ref?: string, title?: string, status?: number, error?: string}}
 */
export function adminCreateProject(entity, validate = false) {
    return runAdmin('create-project', [String(entity), validate ? '1' : '0']);
}

/**
 * Delete a Project row, teardown safety net for project specs.
 *
 * @param {number} entity
 * @param {number} projId
 * @returns {{ok: boolean, deleted: number}}
 */
export function adminDeleteProject(entity, projId) {
    return runAdmin('delete-project', [String(entity), String(projId)]);
}
