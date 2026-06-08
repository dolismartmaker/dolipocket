import { useEffect, useState } from "react";

import { getCachedLinesCatalog, setCachedLinesCatalog } from "./linesCatalogCache";

// Loads the lines column catalog from the backend
// (GET /<feature>/lines/columns) with a localStorage cache for instant
// rendering and background revalidation. Mirrors useColumnCatalog but for
// document lines.
//
// Returns:
//   - catalog : Array<ColumnDef> | null
//                 null    -> not yet loaded AND no cache.
//                 Array   -> the resolved catalog (server-fresh or cached).
//   - loading : true while the first probe is in flight (false as soon as
//               a cached value is available).
//   - error   : last fetch error, or null.
export const useLinesCatalog = ({ dataSource, feature }) => {
    const [catalog, setCatalog] = useState(() => {
        const cached = feature ? getCachedLinesCatalog(feature) : null;
        return cached?.catalog ?? null;
    });
    const [loading, setLoading] = useState(() => {
        const cached = feature ? getCachedLinesCatalog(feature) : null;
        return cached === null;
    });
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        if (!feature) {
            setLoading(false);
            return () => {};
        }

        if (typeof dataSource?.linesColumns !== "function") {
            const msg = "dataSource.linesColumns() not implemented";
            console.warn("[useLinesCatalog]", msg, "(feature=", feature, ")");
            setError(new Error(msg));
            setLoading(false);
            return () => {};
        }

        const cached = getCachedLinesCatalog(feature);
        setLoading(cached === null);

        dataSource.linesColumns()
            .then((fresh) => {
                if (cancelled) return;
                const arr = Array.isArray(fresh) ? fresh : [];
                setCatalog(arr);
                setCachedLinesCatalog(feature, arr);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useLinesCatalog] fetch failed", feature, err);
                if (cached === null) setError(err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
        // We deliberately depend only on `feature` -- dataSource is rebuilt
        // on every render (useApi() unstable). Cf useColumnCatalog.
    }, [feature]);

    return { catalog, loading, error };
};
