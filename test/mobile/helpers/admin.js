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
