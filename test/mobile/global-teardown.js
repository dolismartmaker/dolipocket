/**
 * test/mobile/global-teardown.js
 *
 * Kill the php -S and vite preview processes spawned by global-setup.js.
 * Server logs are dumped to STDERR if Playwright failed (helps debug CI).
 */
export default async function globalTeardown() {
    const failed = process.exitCode && process.exitCode !== 0;

    if (globalThis.__E2E_PWA__) {
        if (failed) {
            process.stderr.write('--- vite log ---\n' + globalThis.__E2E_PWA__.getLog().join('\n') + '\n');
        }
        await globalThis.__E2E_PWA__.kill();
    }
    if (globalThis.__E2E_BACKEND__) {
        if (failed) {
            process.stderr.write('--- php -S log ---\n' + globalThis.__E2E_BACKEND__.getLog().join('\n') + '\n');
        }
        await globalThis.__E2E_BACKEND__.kill();
    }
    process.stderr.write('e2e: teardown complete\n');
}
