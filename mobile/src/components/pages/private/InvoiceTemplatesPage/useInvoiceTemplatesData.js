import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbInvoiceRecs } from "src/db/stores/invoiceRecs/useDbInvoiceRecs";

// Shared data layer for InvoiceTemplatesPage (mobile + desktop).

export const useInvoiceTemplatesData = () => {
    const navigate = useNavigate();
    const dbInvoiceRecs = useDbInvoiceRecs();
    const hasClient = !!dbInvoiceRecs.list;

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        suspended: "",
    });

    const { items, loading, error, q, suspended } = states ?? {};

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
            if (suspended !== "" && suspended !== null && suspended !== undefined) params.suspended = suspended;
            const rows = await dbInvoiceRecs.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(r => (r.title ?? "").toLowerCase().includes(needle))
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbInvoiceRecs.list error", err);
            set("error", "Erreur de chargement des modèles récurrents");
        } finally {
            set("loading", false);
        }
    };

    const dataSource = useMemo(() => ({
        count: (params) => dbInvoiceRecs.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbInvoiceRecs.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbInvoiceRecs.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbInvoiceRecs.columns?.(opts) ?? Promise.resolve([]),
    }), []);

    return {
        navigate,
        dbInvoiceRecs,
        items,
        loading,
        error,
        q,
        suspended,
        set,
        loadList,
        dataSource,
    };
};
