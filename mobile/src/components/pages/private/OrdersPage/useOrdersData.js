import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";

// Shared data layer for OrdersPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useOrdersData = () => {
    const navigate = useNavigate();
    const dbOrders = useDbOrders();
    const hasClient = !!dbOrders.list;

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        status: "",
    });

    const { items, loading, error, q, status } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadList();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient]);

    const loadList = async () => {
        set("loading", true);
        set("error", null);
        try {
            // The orders hook does not expose a `q` filter; we rely on
            // backend-side filtering of refClient/ref via search params.
            const params = {};
            if (status !== "" && status !== null && status !== undefined) params.status = status;
            const rows = await dbOrders.list(params);
            // Apply client-side ref/refClient search since the hook does not pass q.
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(o =>
                    (o.ref ?? "").toLowerCase().includes(needle) ||
                    (o.refClient ?? "").toLowerCase().includes(needle)
                )
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbOrders.list error", err);
            set("error", "Erreur de chargement des commandes");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbOrders.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbOrders.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbOrders.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbOrders.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbOrders,

        // mobile-only state + handlers
        items,
        loading,
        error,
        q,
        status,
        set,
        loadList,

        // desktop-only data source
        dataSource,
    };
};
