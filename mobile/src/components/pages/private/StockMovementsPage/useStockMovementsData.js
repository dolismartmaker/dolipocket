import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbStockMovements } from "src/db/stores/stockMovements/useDbStockMovements";

// Shared data layer for StockMovementsPage (mobile + desktop). Read-only
// chronological history of stock movements with product / warehouse / date
// filters. Data fetching lives here only (cf .claude/CLAUDE.md viewport-aware
// pattern); the two views are pure render.
export const useStockMovementsData = () => {
    const navigate = useNavigate();
    const dbProducts = useDbProducts();
    const dbWarehouses = useDbWarehouses();
    const dbStockMovements = useDbStockMovements();
    const hasClient = !!dbProducts.list && !!dbWarehouses.list && !!dbStockMovements.list;

    const { states, set } = useStates({
        movements: [],
        products: [],
        warehouses: [],
        loading: true,
        error: null,
        filters: {
            fkProduct: "",
            fkEntrepot: "",
            dateFrom: "",
            dateTo: "",
        },
    });

    const { movements, products, warehouses, loading, error, filters } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadProducts();
            loadWarehouses();
            loadMovements();
        }
    }, [hasClient]);

    useEffect(() => {
        if (hasClient) {
            loadMovements();
        }
    }, [filters?.fkProduct, filters?.fkEntrepot, filters?.dateFrom, filters?.dateTo]);

    const loadProducts = async () => {
        try {
            const rows = await dbProducts.list({ type: 0 });
            set("products", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbProducts.list error", err);
        }
    };

    const loadWarehouses = async () => {
        try {
            const rows = await dbWarehouses.list();
            set("warehouses", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbWarehouses.list error", err);
        }
    };

    const loadMovements = async () => {
        set("loading", true);
        set("error", null);
        try {
            const params = { perPage: 100 };
            if (filters?.fkProduct) params.fkProduct = Number(filters.fkProduct);
            if (filters?.fkEntrepot) params.fkEntrepot = Number(filters.fkEntrepot);
            if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters?.dateTo) params.dateTo = filters.dateTo;
            const rows = await dbStockMovements.list(params);
            set("movements", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbStockMovements.list error", err);
            set("error", "Erreur de chargement de l'historique");
        } finally {
            set("loading", false);
        }
    };

    const setFilter = (field, value) => set(`filters.${field}`, value);

    const handleBack = () => {
        navigate("/stock");
    };

    const productLabel = (id) => {
        const p = (products ?? []).find((x) => Number(x.id) === Number(id));
        return p ? `${p.ref} - ${p.label}` : `#${id}`;
    };

    const warehouseLabel = (id) => {
        const w = (warehouses ?? []).find((x) => Number(x.id) === Number(id));
        return w ? (w.label || w.ref) : `#${id}`;
    };

    const formatDate = (value) => {
        if (!value) return "";
        // datem comes back as a Unix timestamp in seconds when JSON-encoded
        // from a Dolibarr int field.
        const ts = Number(value);
        if (!isFinite(ts) || ts <= 0) return String(value);
        const date = new Date(ts * 1000);
        return date.toLocaleString("fr-FR", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    };

    return {
        movements,
        products,
        warehouses,
        loading,
        error,
        filters,
        setFilter,
        handleBack,
        productLabel,
        warehouseLabel,
        formatDate,
    };
};
