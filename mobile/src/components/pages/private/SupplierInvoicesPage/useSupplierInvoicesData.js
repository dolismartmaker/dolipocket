import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";

// Shared data layer for SupplierInvoicesPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useSupplierInvoicesData = () => {
    const navigate = useNavigate();
    const dbSI = useDbSupplierInvoices();
    const hasClient = !!dbSI.list;

    const { states, set } = useStates({
        invoices: [],
        loading: false,
        error: null,
        statusFilter: "",
        payeFilter: "",
    });

    const { invoices = [], loading, error, statusFilter, payeFilter } = states ?? {};

    const loadInvoices = async () => {
        if (!hasClient) return;
        set("loading", true);
        set("error", null);
        try {
            const rows = await dbSI.list({
                status: statusFilter !== "" ? statusFilter : undefined,
                paye: payeFilter !== "" ? payeFilter : undefined,
            });
            set("invoices", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbSI.list error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    useEffect(() => {
        if (hasClient) loadInvoices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, statusFilter, payeFilter]);

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbSI.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbSI.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbSI.list({ ...params }),
        columns: (opts) => dbSI.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbSI,

        // mobile-only state + handlers
        invoices,
        loading,
        error,
        statusFilter,
        payeFilter,
        set,
        loadInvoices,

        // desktop-only data source
        dataSource,
    };
};
