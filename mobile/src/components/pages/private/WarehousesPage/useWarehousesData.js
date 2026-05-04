import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";

// Shared data layer for WarehousesPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useWarehousesData = () => {
    const navigate = useNavigate();
    const dbWarehouses = useDbWarehouses();
    const hasClient = !!dbWarehouses.list;

    const { states, set } = useStates({
        items: [],
        loading: true,
        error: null,
        query: "",
    });

    const { items, loading, error, query } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadItems();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, query]);

    const loadItems = async () => {
        set("loading", true);
        set("error", null);
        try {
            const params = {};
            if (query && query.trim().length > 0) {
                params.q = query.trim();
            }
            const rows = await dbWarehouses.list(params);
            set("items", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbWarehouses.list error", err);
            set("error", "Erreur de chargement des entrepots");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbWarehouses.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbWarehouses.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbWarehouses.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbWarehouses.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbWarehouses,

        // mobile-only state + handlers
        items,
        loading,
        error,
        query,
        set,
        loadItems,

        // desktop-only data source
        dataSource,
    };
};
