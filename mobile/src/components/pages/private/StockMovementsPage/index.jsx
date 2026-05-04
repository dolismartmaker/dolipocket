import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaArrowDown, FaArrowUp } from "react-icons/fa";

import { Page, Input, useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbStockMovements } from "src/db/stores/stockMovements/useDbStockMovements";

/**
 * StockMovementsPage: chronological history of stock movements.
 *
 * Filters: product, warehouse, date range. Movements are immutable: this view
 * is read-only.
 */
export const StockMovementsPage = () => {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient]);

    useEffect(() => {
        if (hasClient) {
            loadMovements();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Historique des mouvements</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{movements?.length ?? 0} mouvements</p>
                    </div>
                </div>
            </div>

            <div className="p-4 md:px-6 md:max-w-5xl md:mx-auto flex flex-col gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col gap-3">
                    <div className="text-xs text-gray-400 uppercase">Filtres</div>

                    <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-3">
                        <div className="flex flex-col gap-2 md:flex-1">
                            <label className="text-sm font-medium text-gray-600">Produit</label>
                            <select
                                value={filters?.fkProduct ?? ""}
                                onChange={(e) => setFilter("fkProduct", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200"
                            >
                                <option value="">Tous</option>
                                {(products ?? []).map((p) => (
                                    <option key={p.id} value={p.id}>{p.ref} - {p.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 md:flex-1">
                            <label className="text-sm font-medium text-gray-600">Entrepot</label>
                            <select
                                value={filters?.fkEntrepot ?? ""}
                                onChange={(e) => setFilter("fkEntrepot", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200"
                            >
                                <option value="">Tous</option>
                                {(warehouses ?? []).map((w) => (
                                    <option key={w.id} value={w.id}>{w.label || w.ref}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:flex-1">
                            <Input
                                label="Du"
                                value={filters?.dateFrom ?? ""}
                                onChange={(value) => setFilter("dateFrom", value)}
                                inputProps={{ type: "date" }}
                            />
                            <Input
                                label="Au"
                                value={filters?.dateTo ?? ""}
                                onChange={(value) => setFilter("dateTo", value)}
                                inputProps={{ type: "date" }}
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Chargement...</div>
                ) : (movements?.length ?? 0) === 0 ? (
                    <div className="p-8 text-center text-gray-500">Aucun mouvement</div>
                ) : (
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                        {movements.map((m) => {
                            const qty = Number(m.value ?? 0);
                            const isInput = qty >= 0;
                            return (
                                <div key={m.id} className="bg-white rounded-lg border border-gray-200 p-3">
                                    <div className="flex items-start gap-3">
                                        {isInput ? (
                                            <FaArrowUp className="text-green-600 mt-1 flex-shrink-0" />
                                        ) : (
                                            <FaArrowDown className="text-red-600 mt-1 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-800">
                                                {productLabel(m.fkProduct)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {warehouseLabel(m.fkEntrepot)} - {formatDate(m.datem)}
                                            </div>
                                            {m.label && (
                                                <div className="text-xs text-gray-400 mt-1 italic">{m.label}</div>
                                            )}
                                        </div>
                                        <div className={`text-lg font-bold ${isInput ? "text-green-600" : "text-red-600"}`}>
                                            {isInput ? "+" : ""}{qty}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Page>
    );
};

export default StockMovementsPage;
