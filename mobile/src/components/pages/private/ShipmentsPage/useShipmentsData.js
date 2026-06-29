import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbShipments } from "src/db/stores/shipments/useDbShipments";

// Shared data layer for ShipmentsPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useShipmentsData = () => {
    const navigate = useNavigate();
    const dbShipments = useDbShipments();
    const hasClient = !!dbShipments.list;

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
    }, [hasClient]);

    const loadList = async () => {
        set("loading", true);
        set("error", null);
        try {
            const params = {};
            if (status !== "" && status !== null && status !== undefined) params.status = status;
            const rows = await dbShipments.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(s =>
                    (s.ref ?? "").toLowerCase().includes(needle) ||
                    (s.trackingNumber ?? "").toLowerCase().includes(needle)
                )
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbShipments.list error", err);
            set("error", "Erreur de chargement des expéditions");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbShipments.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbShipments.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbShipments.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbShipments.columns?.(opts) ?? Promise.resolve([]),
    }), []);

    return {
        navigate,
        dbShipments,
        items,
        loading,
        error,
        q,
        status,
        set,
        loadList,
        dataSource,
    };
};
