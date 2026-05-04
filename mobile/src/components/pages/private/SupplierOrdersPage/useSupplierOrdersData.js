import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";

// Shared data layer for SupplierOrdersPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useSupplierOrdersData = () => {
    const navigate = useNavigate();
    const dbSO = useDbSupplierOrders();
    const hasClient = !!dbSO.list;

    const { states, set } = useStates({
        orders: [],
        loading: false,
        error: null,
        statusFilter: "",
        searchQuery: "",
    });

    const { orders = [], loading, error, statusFilter, searchQuery } = states ?? {};

    const loadOrders = async () => {
        if (!hasClient) return;
        set("loading", true);
        set("error", null);
        try {
            const rows = await dbSO.list({
                status: statusFilter !== "" ? statusFilter : undefined,
                q: searchQuery || undefined,
            });
            set("orders", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbSO.list error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    useEffect(() => {
        if (hasClient) loadOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, statusFilter]);

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbSO.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbSO.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbSO.list({ ...params }),
        columns: (opts) => dbSO.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbSO,

        // mobile-only state + handlers
        orders,
        loading,
        error,
        statusFilter,
        searchQuery,
        set,
        loadOrders,

        // desktop-only data source
        dataSource,
    };
};
