import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbStockMovements } from "src/db/stores/stockMovements/useDbStockMovements";

// Shared data layer for StockPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf .claude/CLAUDE.md viewport-aware pattern). Both views
// drive the same adjustment state: `adjusting` holds the product currently
// being adjusted -- mobile expands an inline panel, desktop opens a modal.
//
// Optional query string params (carried through from the products page):
//   - product=<id>    : pre-open the adjustment for that product
//   - warehouse=<id>  : pre-select that warehouse for adjustments
export const useStockData = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialProduct = searchParams.get("product");
    const initialWarehouse = searchParams.get("warehouse");

    const dbProducts = useDbProducts();
    const dbWarehouses = useDbWarehouses();
    const dbStockMovements = useDbStockMovements();
    const hasClient = !!dbProducts.list && !!dbWarehouses.list && !!dbStockMovements.create;

    const { states, set } = useStates({
        products: [],
        warehouses: [],
        loading: true,
        error: null,
        query: "",
        warehouseId: initialWarehouse ? Number(initialWarehouse) : null,
        adjusting: null,
        adjQty: "",
        adjLabel: "",
        saving: false,
    });

    const { products, warehouses, loading, error, query, warehouseId, adjusting, adjQty, adjLabel, saving } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadWarehouses();
            loadProducts();
        }
    }, [hasClient, query]);

    useEffect(() => {
        // Pre-open the adjustment for the requested product once products load.
        if (initialProduct && (products?.length ?? 0) > 0 && !adjusting) {
            const target = products.find((p) => Number(p.id) === Number(initialProduct));
            if (target) {
                set("adjusting", target);
            }
        }
    }, [products]);

    const loadWarehouses = async () => {
        try {
            // Active warehouses only for adjustment selection.
            const rows = await dbWarehouses.list();
            const active = (Array.isArray(rows) ? rows : []).filter((w) => Number(w.statut) === 1);
            set("warehouses", active);
            // Auto-select the first warehouse when none was preselected.
            if (!warehouseId && active.length > 0) {
                set("warehouseId", Number(active[0].id));
            }
        } catch (err) {
            console.error("dbWarehouses.list error", err);
        }
    };

    const loadProducts = async () => {
        set("loading", true);
        set("error", null);
        try {
            // Inventory only makes sense for type=0 (products), services have no stock.
            const params = { type: 0 };
            if (query && query.trim().length > 0) {
                params.q = query.trim();
            }
            const rows = await dbProducts.list(params);
            set("products", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbProducts.list error", err);
            set("error", "Erreur de chargement de l'inventaire");
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => {
        navigate("/");
    };

    const startAdjust = (product) => {
        set("adjusting", product);
        set("adjQty", "");
        set("adjLabel", "");
    };

    const cancelAdjust = () => {
        set("adjusting", null);
        set("adjQty", "");
        set("adjLabel", "");
    };

    const submitAdjust = async (sign) => {
        if (!warehouseId) {
            set("error", "Sélectionner un entrepôt");
            return;
        }
        const numQty = Number(adjQty);
        if (!isFinite(numQty) || numQty === 0) {
            set("error", "Quantité invalide");
            return;
        }
        set("saving", true);
        set("error", null);
        try {
            await dbStockMovements.create({
                fkProduct: Number(adjusting.id),
                fkEntrepot: Number(warehouseId),
                value: sign * Math.abs(numQty),
                label: adjLabel ?? "",
            });
            cancelAdjust();
            await loadProducts();
        } catch (err) {
            console.error("dbStockMovements.create error", err);
            set("error", "Échec de l'enregistrement du mouvement");
        } finally {
            set("saving", false);
        }
    };

    return {
        navigate,
        products,
        warehouses,
        loading,
        error,
        query,
        warehouseId,
        adjusting,
        adjQty,
        adjLabel,
        saving,
        set,
        handleBack,
        startAdjust,
        cancelAdjust,
        submitAdjust,
    };
};
