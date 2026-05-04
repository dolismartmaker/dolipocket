// localStorage cache for the column catalog returned by GET /<feature>/columns.
//
// Cf DATATABLE_SPEC.md §13. The cache is read synchronously at mount so the
// table can render immediately even if the network is slow or the user is
// offline. A revalidation fetch then refreshes the cache in the background.
//
// Storage key format: dolipocket.list.<feature>.catalog
// Storage shape    : { catalog: [...], fetchedAt: <epoch ms> }
// TTL              : 1 day. Past TTL the cache is still returned (so an
//                    offline user gets stale data instead of an empty table)
//                    but callers may decide to refetch eagerly.

const TTL_MS = 24 * 60 * 60 * 1000;

const buildKey = (feature) => `dolipocket.list.${feature}.catalog`;

export const getCachedCatalog = (feature) => {
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

export const setCachedCatalog = (feature, catalog) => {
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

export const clearCachedCatalog = (feature) => {
    if (!feature || typeof window === "undefined") return;
    try {
        window.localStorage?.removeItem(buildKey(feature));
    } catch (_e) {
        // ignore
    }
};
