// localStorage cache for the lines column catalog returned by
// GET /<feature>/lines/columns.
//
// Same model as DataTable/utils/catalogCache.js but namespaced to lines so
// the two caches never collide (header columns vs line columns are two
// different sets even for a single feature).
//
// Storage key format : dolipocket.lines.<feature>.catalog
// Storage shape     : { catalog: [...], fetchedAt: <epoch ms> }
// TTL               : 1 day. Past TTL the cache is still returned (so an
//                     offline user gets stale data instead of an empty
//                     table) but callers may decide to refetch eagerly.

const TTL_MS = 24 * 60 * 60 * 1000;

const buildKey = (feature) => `dolipocket.lines.${feature}.catalog`;

export const getCachedLinesCatalog = (feature) => {
    if (!feature || typeof window === "undefined") return null;
    try {
        const raw = window.localStorage?.getItem(buildKey(feature));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.catalog)) return null;
        return {
            catalog: parsed.catalog,
            fetchedAt: Number(parsed.fetchedAt ?? 0),
            stale: Number(parsed.fetchedAt ?? 0) + TTL_MS < Date.now(),
        };
    } catch (_e) {
        return null;
    }
};

export const setCachedLinesCatalog = (feature, catalog) => {
    if (!feature || typeof window === "undefined") return;
    if (!Array.isArray(catalog)) return;
    try {
        window.localStorage?.setItem(
            buildKey(feature),
            JSON.stringify({ catalog, fetchedAt: Date.now() }),
        );
    } catch (_e) {
        // Storage unavailable (private mode, quota etc.): skip silently.
    }
};

export const clearCachedLinesCatalog = (feature) => {
    if (!feature || typeof window === "undefined") return;
    try {
        window.localStorage?.removeItem(buildKey(feature));
    } catch (_e) {
        // ignore
    }
};
