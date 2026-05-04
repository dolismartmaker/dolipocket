import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";

// Shared data layer for InvoicesPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useInvoicesData = () => {
    const navigate = useNavigate();
    const dbInvoices = useDbInvoices();
    const hasClient = !!dbInvoices.list;

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        status: "",
        paye: "",
    });

    const { items, loading, error, q, status, paye } = states ?? {};

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
            // The invoices hook does not expose a `q` filter; we filter
            // client-side on ref/refClient after fetching.
            const params = {};
            if (status !== "" && status !== null && status !== undefined) params.status = status;
            if (paye !== "" && paye !== null && paye !== undefined) params.paye = paye;
            const rows = await dbInvoices.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(f =>
                    (f.ref ?? "").toLowerCase().includes(needle) ||
                    (f.refClient ?? "").toLowerCase().includes(needle)
                )
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbInvoices.list error", err);
            set("error", "Erreur de chargement des factures");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbInvoices.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbInvoices.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbInvoices.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbInvoices.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbInvoices,

        // mobile-only state + handlers
        items,
        loading,
        error,
        q,
        status,
        paye,
        set,
        loadList,

        // desktop-only data source
        dataSource,
    };
};
