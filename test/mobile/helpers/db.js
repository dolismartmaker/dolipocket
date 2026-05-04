/**
 * test/mobile/helpers/db.js
 *
 * Small helpers around the test SQLite database for spec-side assertions.
 *
 * The path comes from backend-info.json (written by backend/init.php and
 * exposed via the E2E_BACKEND_INFO env var). We open a SHARED connection
 * (mode=READONLY by default) to avoid contention with the php -S backend
 * that is also writing to the same file.
 *
 * Helpers exposed here are intentionally minimal -- this is only used to
 * cross-check API behaviour from the SQLite side, not as a primary
 * assertion mechanism. Most tests should rely on UI-visible state instead.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

let dbHandle = null;

function loadBackendInfo() {
    const path = process.env.E2E_BACKEND_INFO;
    if (!path) {
        throw new Error('E2E_BACKEND_INFO env var not set -- did global-setup run?');
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

function getDb() {
    if (!dbHandle) {
        const info = loadBackendInfo();
        dbHandle = new Database(info.dbPath, { readonly: true, fileMustExist: true });
    }
    return dbHandle;
}

/**
 * Return the rowid of the first societe with this name and entity, or null.
 *
 * @param {string} name
 * @param {number} entity
 * @returns {number|null}
 */
export function findSocieteIdByName(name, entity) {
    const db = getDb();
    const row = db
        .prepare('SELECT rowid FROM llx_societe WHERE nom = ? AND entity = ? LIMIT 1')
        .get(name, entity);
    return row ? Number(row.rowid) : null;
}

/**
 * Count societes for a given entity, useful as a sanity check that the
 * test entity is well-isolated.
 *
 * @param {number} entity
 * @returns {number}
 */
export function countSocietes(entity) {
    const db = getDb();
    const row = db
        .prepare('SELECT COUNT(*) AS n FROM llx_societe WHERE entity = ?')
        .get(entity);
    return Number(row?.n ?? 0);
}

/**
 * Return the row of the test tenant from llx_dolipocket_tenant.
 *
 * @param {string} email
 * @returns {object|null}
 */
export function findTenantByEmail(email) {
    const db = getDb();
    return (
        db
            .prepare('SELECT rowid, entity, status, fk_user_admin FROM llx_dolipocket_tenant WHERE email = ? LIMIT 1')
            .get(email) ?? null
    );
}

export function closeDb() {
    if (dbHandle) {
        dbHandle.close();
        dbHandle = null;
    }
}
