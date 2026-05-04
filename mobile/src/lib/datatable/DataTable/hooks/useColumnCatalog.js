import { useEffect, useState } from "react";

import { getCachedCatalog, setCachedCatalog } from "../utils/catalogCache";

// Loads the column catalog from the backend (GET /<feature>/columns) with a
// localStorage cache for instant rendering and background revalidation.
//
// Returns:
//   - catalog : Array<ColumnDef> | null
//                 null    -> not yet loaded AND no cache. The DataTable will
//                            fall back to legacy listConfig.columns or display
//                            a "Catalogue indisponible" banner if neither
//                            source is available.
//                 Array   -> the resolved catalog (server-fresh or cached).
//   - loading : true while the first probe is in flight (false as soon as a
//               cached value is available).
//   - error   : last fetch error, or null. Surfaced to the UI only when the
//               cache is empty (stale cache + offline = no banner, just stale
//               data).
//
// Pieges :
//   - dataSource is rebuilt on every render (useApi() is unstable). We
//     intentionally depend only on `feature` to avoid an infinite re-fetch
//     loop. The first call wins for the lifetime of the page.
export const useColumnCatalog = ({ dataSource, feature }) => {
    const [catalog, setCatalog] = useState(() => {
        const cached = feature ? getCachedCatalog(feature) : null;
        return cached?.catalog ?? null;
    });
    const [loading, setLoading] = useState(() => {
        const cached = feature ? getCachedCatalog(feature) : null;
        return cached === null;
    });
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        if (!feature) {
            setLoading(false);
            return () => {};
        }

        if (typeof dataSource?.columns !== "function") {
            const msg = "dataSource.columns() not implemented";
            console.warn("[useColumnCatalog]", msg, "(feature=", feature, ")");
            setError(new Error(msg));
            setLoading(false);
            return () => {};
        }

        // Always fetch in background to revalidate the cache. Show stale data
        // immediately if any.
        const cached = getCachedCatalog(feature);
        setLoading(cached === null);

        dataSource.columns()
            .then((fresh) => {
                if (cancelled) return;
                const arr = Array.isArray(fresh) ? fresh : [];
                setCatalog(arr);
                setCachedCatalog(feature, arr);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useColumnCatalog] fetch failed", feature, err);
                if (cached === null) setError(err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [feature]);

    return { catalog, loading, error };
};
