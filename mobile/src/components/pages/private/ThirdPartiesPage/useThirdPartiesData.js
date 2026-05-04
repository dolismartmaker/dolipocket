import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// Shared data layer for ThirdPartiesPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, not in *.mobile.jsx /
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").

export const useThirdPartiesData = () => {
    const navigate = useNavigate();
    const dbThirdParties = useDbThirdParties();

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        filter: "all",
        page: 1,
    });

    const { items, loading, error, q, filter, page } = states ?? {};

    const hasClient = !!dbThirdParties.list;

    useEffect(() => {
        if (!hasClient) return;
        loadThirdParties(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, q, filter]);

    const loadThirdParties = async (targetPage = 1) => {
        set("loading", true);
        set("error", null);
        try {
            const params = { page: targetPage, perPage: 50 };
            if (q && q.trim().length > 0) params.q = q.trim();
            if (filter === "client") params.client = 1;
            else if (filter === "fournisseur") params.fournisseur = 1;
            const rows = await dbThirdParties.list(params);
            set("items", rows ?? []);
            set("page", targetPage);
        } catch (err) {
            console.error("dbThirdParties.list error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const dataSource = useMemo(() => ({
        count: (params) => dbThirdParties.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbThirdParties.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbThirdParties.list({ ...params, perPage: 5000 }),
        // v2 -- column catalog (cf DATATABLE_SPEC.md §13).
        columns: (opts) => dbThirdParties.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        navigate,
        dbThirdParties,
        items, loading, error, q, filter, page,
        set, loadThirdParties,
        dataSource,
    };
};
