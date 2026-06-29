import { FaHistory } from "react-icons/fa";

import { StockAdjustModal } from "./StockAdjustModal";

// Desktop inventory view. Plain flex container that fills the AppShell <main>
// (no <Page> wrapper -> no 2-col grid split). Sticky toolbar with the warehouse
// selector + search, then a dense table (Dolibarr density: 32px rows, 13px
// font). Adjusting opens StockAdjustModal. Épuré UI conventions: borders not
// shadows, no rounded-2xl, no hover:shadow (cf .claude/CLAUDE.md).
export const StockPageDesktop = (props) => {
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
        startAdjust,
        cancelAdjust,
        submitAdjust,
    } = props;

    const rows = products ?? [];
    const activeWarehouse = (warehouses ?? []).find((w) => Number(w.id) === Number(warehouseId)) ?? null;

    const stockClass = (value) => {
        const n = Number(value ?? 0);
        if (n < 0) return "text-red-600";
        if (n === 0) return "text-gray-400";
        return "text-strong-text";
    };

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <h1 className="text-base font-bold text-strong-text">
                    Inventaire
                    <span className="ml-1 font-normal text-gray-500">({rows.length})</span>
                </h1>

                <div className="flex items-center gap-2 ml-auto">
                    {(warehouses?.length ?? 0) > 0 && (
                        <label className="flex items-center gap-1.5 text-[13px] text-soft-text">
                            <span className="whitespace-nowrap">Entrepôt</span>
                            <select
                                value={warehouseId ?? ""}
                                onChange={(e) => set("warehouseId", e.target.value ? Number(e.target.value) : null)}
                                className="h-[32px] px-2 rounded border border-soft-border text-[13px] text-strong-text focus:border-primary focus:outline-none"
                            >
                                {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>{w.label || w.ref}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    <input
                        type="search"
                        value={query ?? ""}
                        onChange={(e) => set("query", e.target.value)}
                        placeholder="Référence, libellé, code-barres..."
                        className="h-[32px] w-64 px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none"
                    />

                    <button
                        type="button"
                        onClick={() => navigate("/stock/movements")}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors"
                    >
                        <FaHistory className="text-[11px]" />
                        <span>Historique</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="shrink-0 px-4 py-2 bg-red-100 text-red-700 text-[13px] border-b border-red-200">
                    {error}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
                {loading ? (
                    <div className="p-8 text-center text-gray-500 text-[13px]">Chargement...</div>
                ) : rows.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-[13px]">Aucun produit</div>
                ) : (
                    <table className="w-full border-collapse text-[13px]">
                        <thead className="sticky top-0 z-10 bg-medium-bg/60">
                            <tr className="text-left text-soft-text">
                                <th className="font-medium px-4 py-2 w-44">Référence</th>
                                <th className="font-medium px-4 py-2">Libellé</th>
                                <th className="font-medium px-4 py-2 w-28 text-right">Stock</th>
                                <th className="font-medium px-4 py-2 w-32 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((p) => (
                                <tr
                                    key={p.id}
                                    className="border-b border-soft-border/60 hover:bg-gray-50 transition-colors"
                                >
                                    <td className="px-4 py-1.5 text-soft-text whitespace-nowrap">{p.ref}</td>
                                    <td className="px-4 py-1.5 text-strong-text truncate max-w-0">
                                        <span className="block truncate">{p.label}</span>
                                    </td>
                                    <td className={`px-4 py-1.5 text-right font-semibold tabular-nums ${stockClass(p.stockReel)}`}>
                                        {Number(p.stockReel ?? 0)}
                                    </td>
                                    <td className="px-4 py-1.5 text-right">
                                        <button
                                            type="button"
                                            onClick={() => startAdjust(p)}
                                            className="h-[28px] px-2.5 rounded text-[12px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                        >
                                            Ajuster
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <StockAdjustModal
                product={adjusting}
                warehouse={activeWarehouse}
                adjQty={adjQty}
                adjLabel={adjLabel}
                saving={saving}
                set={set}
                onSubmit={submitAdjust}
                onClose={cancelAdjust}
            />
        </div>
    );
};

export default StockPageDesktop;
