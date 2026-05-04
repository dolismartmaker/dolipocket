import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProposals } from "src/db/stores/proposals/useDbProposals";

// Shared data layer for ProposalsPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useProposalsData = () => {
    const navigate = useNavigate();
    const dbProposals = useDbProposals();
    const hasClient = !!dbProposals.list;

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
            const rows = await dbProposals.list({ q, status });
            set("items", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbProposals.list error", err);
            set("error", "Erreur de chargement des devis");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbProposals.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbProposals.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbProposals.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbProposals.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbProposals,

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
