/**
 * test/mobile/helpers/servers.js
 *
 * Spawn / kill the two HTTP servers needed by the E2E suite:
 *   - php -S       : the Dolibarr SQLite backend (default port 8790)
 *   - vite preview : the PWA static build         (default port 5195)
 *
 * The PHP backend uses the dedicated test/mobile/backend/router.php which
 * routes URLs to either:
 *   - /custom/dolipocket/pwa/api.php/...   (the PWA API consumed by the SPA)
 *   - /custom/dolipocket/public/...        (the public Blade site, used by
 *                                           the Playwright login flow)
 *
 * The PWA is built with VITE_API_URL pointing at the backend so all `fetch`
 * calls go through the real php -S.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../..');

async function waitForHttp(url, timeoutMs = 30_000, intervalMs = 200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
            // Any HTTP response (even 404) means the server is up.
            if (r.status >= 0) return true;
        } catch {
            // Not yet listening, retry.
        }
        await sleep(intervalMs);
    }
    throw new Error(`Server at ${url} did not become reachable within ${timeoutMs} ms`);
}

export async function startBackend({ port }) {
    const docroot = resolve(projectRoot, 'vendor/cap-rel/dolibarr-integration-sqlite/htdocs');
    const router = resolve(__dirname, '../backend/router.php');

    const child = spawn(
        'php',
        ['-S', `127.0.0.1:${port}`, '-t', docroot, router],
        {
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
        }
    );

    const log = [];
    child.stdout.on('data', (d) => log.push(`[php-stdout] ${d.toString().trim()}`));
    child.stderr.on('data', (d) => log.push(`[php-stderr] ${d.toString().trim()}`));
    child.on('exit', (code, signal) => log.push(`[php-exit] code=${code} signal=${signal}`));

    // Smoke-test the public landing page (always reachable, requires no auth).
    await waitForHttp(`http://127.0.0.1:${port}/custom/dolipocket/public/`);

    return {
        port,
        async kill() {
            child.kill('SIGTERM');
            await Promise.race([
                new Promise((r) => child.once('exit', r)),
                sleep(2000).then(() => child.kill('SIGKILL')),
            ]);
        },
        getLog: () => log.slice(),
    };
}

export async function startPwa({ port, backendPort }) {
    // We always run via `vite preview` (production-ish bundle). `vite dev`
    // is intentionally NOT supported here: it would drift from what users
    // actually run.
    const apiUrl = `http://127.0.0.1:${backendPort}/custom/dolipocket/pwa/api.php/`;
    const mobileDir = resolve(projectRoot, 'mobile');

    // Build the PWA fresh so VITE_API_URL is baked in.
    const buildEnv = { ...process.env, VITE_API_URL: apiUrl };
    await new Promise((resolveBuild, rejectBuild) => {
        const build = spawn('npx', ['vite', 'build'], {
            cwd: mobileDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: buildEnv,
        });
        const out = [];
        build.stdout.on('data', (d) => out.push(d.toString()));
        build.stderr.on('data', (d) => out.push(d.toString()));
        build.on('exit', (code) => {
            if (code === 0) resolveBuild();
            else rejectBuild(new Error(`vite build failed (code=${code}):\n${out.join('')}`));
        });
    });

    const child = spawn(
        'npx',
        ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
        {
            cwd: mobileDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, VITE_API_URL: apiUrl },
        }
    );
    const log = [];
    child.stdout.on('data', (d) => log.push(`[vite-stdout] ${d.toString().trim()}`));
    child.stderr.on('data', (d) => log.push(`[vite-stderr] ${d.toString().trim()}`));
    child.on('exit', (code, signal) => log.push(`[vite-exit] code=${code} signal=${signal}`));

    await waitForHttp(`http://127.0.0.1:${port}/`, 60_000);

    return {
        port,
        async kill() {
            child.kill('SIGTERM');
            await Promise.race([
                new Promise((r) => child.once('exit', r)),
                sleep(2000).then(() => child.kill('SIGKILL')),
            ]);
        },
        getLog: () => log.slice(),
    };
}
