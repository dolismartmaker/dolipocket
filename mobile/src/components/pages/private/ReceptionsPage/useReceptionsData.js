import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbReceptions } from "src/db/stores/receptions/useDbReceptions";

// Shared data layer for ReceptionsPage (mobile + desktop).
// Data fetching MUST live here, never in *.mobile.jsx or *.desktop.jsx.

export const useReceptionsData = () => {
    const navigate = useNavigate();
    const dbReceptions = useDbReceptions();
    const hasClient = !!dbReceptions.list;

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
            const rows = await dbReceptions.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(r =>
                    (r.ref ?? "").toLowerCase().includes(needle) ||
                    (r.refSupplier ?? "").toLowerCase().includes(needle) ||
                    (r.trackingNumber ?? "").toLowerCase().includes(needle)
                )
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbReceptions.list error", err);
            set("error", "Erreur de chargement des réceptions");
        } finally {
            set("loading", false);
        }
    };

    const dataSource = useMemo(() => ({
        count: (params) => dbReceptions.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbReceptions.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbReceptions.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbReceptions.columns?.(opts) ?? Promise.resolve([]),
    }), []);

    return {
        navigate,
        dbReceptions,
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
