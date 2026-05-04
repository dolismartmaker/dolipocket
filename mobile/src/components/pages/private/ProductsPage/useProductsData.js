import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";

// Shared data layer for ProductsPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// This hook returns:
// - everything the mobile view needs (legacy list + type/query state)
// - a `dataSource` object the desktop DataTable consumes (count + listPaged + list)

export const useProductsData = () => {
    const navigate = useNavigate();
    const dbProducts = useDbProducts();
    const hasClient = !!dbProducts.list;

    const { states, set } = useStates({
        items: [],
        loading: true,
        error: null,
        type: 0,
        query: "",
    });

    const { items, loading, error, type, query } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadItems();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, type, query]);

    const loadItems = async () => {
        set("loading", true);
        set("error", null);
        try {
            const params = {};
            if (type !== null && type !== undefined) {
                params.type = type;
            }
            if (query && query.trim().length > 0) {
                params.q = query.trim();
            }
            const rows = await dbProducts.list(params);
            set("items", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbProducts.list error", err);
            set("error", "Erreur de chargement des produits");
        } finally {
            set("loading", false);
        }
    };

    // Desktop-side data source for the DataTable (cf DATATABLE_SPEC.md §3).
    const dataSource = useMemo(() => ({
        count: (params) => dbProducts.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbProducts.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbProducts.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbProducts.columns?.(opts) ?? Promise.resolve([]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbProducts,

        // mobile-only state + handlers
        items,
        loading,
        error,
        type,
        query,
        set,
        loadItems,

        // desktop-only data source
        dataSource,
    };
};
