// Best-effort recovery from a stale service-worker cache.
//
// The viewport switch (smartcommon setPreference) does a soft
// window.location.reload(). That reload is intercepted by the service worker,
// which can serve an outdated precached build whose chunks no longer match the
// live code -- producing render crashes such as "X.settings is undefined". A
// hard reload (Ctrl+Shift+R) bypasses the SW and works, which is exactly the
// symptom that points at a stale precache.
//
// This helper unregisters every service worker, deletes every Cache Storage
// entry, then forces a reload on a fresh network fetch. It is called by the
// root ErrorBoundary the first time a render crash happens in a session.
//
// Every failure path logs before continuing (no silent failure): a partial
// purge is still better than none, so we always proceed to the reload.
export const purgeCachesAndReload = async () => {
    try {
        if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
        }
    } catch (err) {
        console.error("DPK recovery: service worker unregister failed", err);
    }

    try {
        if (typeof caches !== "undefined" && typeof caches.keys === "function") {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
        }
    } catch (err) {
        console.error("DPK recovery: cache storage purge failed", err);
    }

    // The SW is gone at this point, so a plain reload already bypasses the
    // precache. We still append a one-shot cache-busting param to defeat any
    // HTTP/proxy cache of index.html; main.jsx strips it again at boot so the
    // URL stays clean.
    try {
        const url = new URL(window.location.href);
        url.searchParams.set("_swr", String(Math.floor(Date.now() / 1000)));
        window.location.replace(url.toString());
    } catch (err) {
        console.error("DPK recovery: cache-busting reload failed, plain reload", err);
        window.location.reload();
    }
};

// Strip the one-shot "_swr" cache-busting param added by purgeCachesAndReload,
// without triggering a navigation. Safe to call unconditionally at boot.
export const stripRecoveryParam = () => {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("_swr")) {
            url.searchParams.delete("_swr");
            window.history.replaceState(null, "", url.toString());
        }
    } catch (err) {
        // Non-critical: a lingering ?_swr= param is harmless.
        console.error("DPK recovery: failed to strip _swr param", err);
    }
};
