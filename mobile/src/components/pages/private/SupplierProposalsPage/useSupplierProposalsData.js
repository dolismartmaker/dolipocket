import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierProposals } from "src/db/stores/supplierProposals/useDbSupplierProposals";

// Shared data layer for SupplierProposalsPage (mobile + desktop).

export const useSupplierProposalsData = () => {
    const navigate = useNavigate();
    const dbSupplierProposals = useDbSupplierProposals();
    const hasClient = !!dbSupplierProposals.list;

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
            const rows = await dbSupplierProposals.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter(r => (r.ref ?? "").toLowerCase().includes(needle))
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbSupplierProposals.list error", err);
            set("error", "Erreur de chargement des demandes de prix");
        } finally {
            set("loading", false);
        }
    };

    const dataSource = useMemo(() => ({
        count: (params) => dbSupplierProposals.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbSupplierProposals.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbSupplierProposals.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbSupplierProposals.columns?.(opts) ?? Promise.resolve([]),
    }), []);

    return {
        navigate,
        dbSupplierProposals,
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
