/**
 * test/mobile/global-setup.js
 *
 * Playwright global setup. Runs once before any spec.
 *
 * 1. Calls test/mobile/backend/init.php which:
 *    - prepares a fresh SQLite database at a stable path
 *    - activates modDolipocket (cascading dependencies, including modSmartauth)
 *    - provisions a test tenant (entity + admin user) with a known password
 *    - sets DOLIPOCKET_PWA_URL so the Blade login redirects to the PWA
 *    - prints the absolute path to a backend-info.json file with credentials
 *
 * 2. Stores the JSON path in process.env.E2E_BACKEND_INFO so the fixture
 *    in fixtures/authenticated.js can read the test credentials.
 *
 * 3. Spawns php -S (Dolibarr backend) and vite preview (PWA). Stores the
 *    handles on globalThis so global-teardown.js can kill them.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackend, startPwa } from './helpers/servers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

export default async function globalSetup() {
    const initScript = resolve(__dirname, 'backend/init.php');

    process.stderr.write('e2e: bootstrapping backend...\n');
    const init = spawnSync('php', [initScript], {
        cwd: projectRoot,
        encoding: 'utf8',
    });
    if (init.status !== 0) {
        process.stderr.write(init.stderr || '');
        process.stderr.write(init.stdout || '');
        throw new Error(`backend init.php failed (code=${init.status})`);
    }
    // init.php writes the JSON state file's absolute path on the LAST line of
    // stdout. Dolibarr can pollute stdout with non-fatal warnings, so we extract
    // the path via regex rather than trust the exact output.
    const m = init.stdout.match(/(\/[^\s]+backend-info\.json)/);
    if (!m) {
        throw new Error(`backend init.php: backend-info.json path not found in stdout. Raw output:\n${init.stdout}`);
    }
    process.env.E2E_BACKEND_INFO = m[1];

    const backendPort = Number(process.env.DOLIPOCKET_TEST_BACKEND_PORT || 8790);
    const pwaPort = Number(process.env.DOLIPOCKET_TEST_PWA_PORT || 5195);

    process.stderr.write(`e2e: starting php -S on ${backendPort}...\n`);
    const backend = await startBackend({ port: backendPort });

    process.stderr.write(`e2e: starting PWA on ${pwaPort}...\n`);
    const pwa = await startPwa({ port: pwaPort, backendPort });

    // Stash handles for teardown.
    globalThis.__E2E_BACKEND__ = backend;
    globalThis.__E2E_PWA__ = pwa;

    process.stderr.write('e2e: setup complete\n');
}
