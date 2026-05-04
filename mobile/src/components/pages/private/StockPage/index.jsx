import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaBox, FaPlus, FaMinus, FaHistory } from "react-icons/fa";

import { Page, Input, Button, useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbStockMovements } from "src/db/stores/stockMovements/useDbStockMovements";

/**
 * StockPage: stock inventory view.
 *
 * Lists products with their current stockReel and exposes a quick adjustment
 * dialog that records a stock movement via dbStockMovements.create().
 *
 * Optional query string params:
 *   - product=<id>    : pre-open the adjustment panel for that product
 *   - warehouse=<id>  : pre-select that warehouse for adjustments and filter
 */
export const StockPage = () => {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, query]);

    useEffect(() => {
        // Pre-open the adjustment for the requested product once products load.
        if (initialProduct && (products?.length ?? 0) > 0 && !adjusting) {
            const target = products.find((p) => Number(p.id) === Number(initialProduct));
            if (target) {
                set("adjusting", target);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            set("error", "Selectionner un entrepot");
            return;
        }
        const numQty = Number(adjQty);
        if (!isFinite(numQty) || numQty === 0) {
            set("error", "Quantite invalide");
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
            set("error", "Echec de l'enregistrement du mouvement");
        } finally {
            set("saving", false);
        }
    };

    const filteredProducts = products ?? [];

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Inventaire</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{filteredProducts.length} produits</p>
                    </div>
                    <button
                        onClick={() => navigate("/stock/movements")}
                        className="p-2 bg-white/20 md:bg-primary md:text-white rounded-full"
                        aria-label="Historique"
                    >
                        <FaHistory />
                    </button>
                </div>
            </div>

            <div className="p-4 md:px-6 md:max-w-5xl md:mx-auto flex flex-col gap-3">
                <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-3">
                    {(warehouses?.length ?? 0) > 0 && (
                        <div className="flex flex-col gap-2 md:flex-1 md:max-w-xs">
                            <label className="text-sm font-medium text-gray-600">Entrepot pour ajustements</label>
                            <select
                                value={warehouseId ?? ""}
                                onChange={(e) => set("warehouseId", e.target.value ? Number(e.target.value) : null)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            >
                                {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>{w.label || w.ref}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="md:flex-1 md:max-w-sm">
                        <Input
                            label="Recherche"
                            value={query ?? ""}
                            onChange={(value) => set("query", value)}
                            inputProps={{ placeholder: "Reference, libelle, code-barres..." }}
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Chargement...</div>
                ) : filteredProducts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Aucun produit</div>
                ) : (
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                        {filteredProducts.map((p) => (
                            <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <FaBox className="text-blue-500 flex-shrink-0" />
                                            <span className="font-medium text-gray-800 truncate">{p.label}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">{p.ref}</div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <div className="text-xl font-bold text-gray-800">
                                            {Number(p.stockReel ?? 0)}
                                        </div>
                                        <div className="text-xs text-gray-400">en stock</div>
                                    </div>
                                </div>
                                {Number(adjusting?.id) === Number(p.id) ? (
                                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
                                        <Input
                                            label="Quantite"
                                            value={String(adjQty ?? "")}
                                            onChange={(value) => set("adjQty", value)}
                                            inputProps={{ type: "number", step: "0.01" }}
                                        />
                                        <Input
                                            label="Motif (optionnel)"
                                            value={adjLabel ?? ""}
                                            onChange={(value) => set("adjLabel", value)}
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={() => submitAdjust(-1)}
                                                loading={saving}
                                                icon={FaMinus}
                                                buttonProps={{ className: "flex-1 py-2 bg-red-100 text-red-700 rounded-lg flex items-center justify-center gap-2" }}
                                            >
                                                Sortie
                                            </Button>
                                            <Button
                                                onClick={() => submitAdjust(1)}
                                                loading={saving}
                                                icon={FaPlus}
                                                buttonProps={{ className: "flex-1 py-2 bg-green-100 text-green-700 rounded-lg flex items-center justify-center gap-2" }}
                                            >
                                                Entree
                                            </Button>
                                            <button
                                                onClick={cancelAdjust}
                                                className="px-3 py-2 text-sm text-gray-500"
                                            >
                                                Annuler
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => startAdjust(p)}
                                        className="mt-2 text-sm text-primary underline"
                                    >
                                        Ajuster le stock
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Page>
    );
};

export default StockPage;
