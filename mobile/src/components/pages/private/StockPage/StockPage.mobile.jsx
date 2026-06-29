import { FaArrowLeft, FaBox, FaPlus, FaMinus, FaHistory } from "react-icons/fa";

import { Page, Input, Button } from "@cap-rel/smartcommon";

// Mobile inventory view: gradient header, warehouse + search controls, and a
// vertical list of product cards. Adjusting a product expands an inline panel.
// Presentational only -- all state + handlers come from useStockData() (cf
// .claude/CLAUDE.md viewport-aware pattern).
export const StockPageMobile = (props) => {
    const {
        navigate,
        warehouses,
        loading,
        error,
        query,
        warehouseId,
        adjusting,
        adjQty,
        adjLabel,
        saving,
        products,
        set,
        handleBack,
        startAdjust,
        cancelAdjust,
        submitAdjust,
    } = props;

    const filteredProducts = products ?? [];

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Inventaire</h1>
                        <p className="text-sm text-white/80">{filteredProducts.length} produits</p>
                    </div>
                    <button
                        onClick={() => navigate("/stock/movements")}
                        className="p-2 bg-white/20 rounded-full"
                        aria-label="Historique"
                    >
                        <FaHistory />
                    </button>
                </div>
            </div>

            <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-3">
                    {(warehouses?.length ?? 0) > 0 && (
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Entrepôt pour ajustements</label>
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

                    <Input
                        label="Recherche"
                        value={query ?? ""}
                        onChange={(value) => set("query", value)}
                        inputProps={{ placeholder: "Référence, libellé, code-barres..." }}
                    />
                </div>

                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Chargement...</div>
                ) : filteredProducts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Aucun produit</div>
                ) : (
                    <div className="flex flex-col gap-2">
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
                                            label="Quantité"
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
                                                Entrée
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

export default StockPageMobile;
