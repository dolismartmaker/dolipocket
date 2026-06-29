import { FaArrowDown, FaArrowUp } from "react-icons/fa";

// Desktop stock movements history. Plain flex container filling the AppShell
// <main> (no <Page> grid). Sticky toolbar carrying the inline filters, then a
// dense read-only table (Dolibarr density). Épuré UI conventions: borders not
// shadows (cf .claude/CLAUDE.md).
export const StockMovementsPageDesktop = (props) => {
    const {
        movements,
        products,
        warehouses,
        loading,
        error,
        filters,
        setFilter,
        productLabel,
        warehouseLabel,
        formatDate,
    } = props;

    const rows = movements ?? [];
    const selectCls = "h-[32px] px-2 rounded border border-soft-border text-[13px] text-strong-text focus:border-primary focus:outline-none";
    const dateCls = "h-[32px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none";

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <h1 className="text-base font-bold text-strong-text whitespace-nowrap">
                    Mouvements de stock
                    <span className="ml-1 font-normal text-gray-500">({rows.length})</span>
                </h1>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <select
                        value={filters?.fkProduct ?? ""}
                        onChange={(e) => setFilter("fkProduct", e.target.value)}
                        className={`${selectCls} max-w-56`}
                    >
                        <option value="">Tous les produits</option>
                        {(products ?? []).map((p) => (
                            <option key={p.id} value={p.id}>{p.ref} - {p.label}</option>
                        ))}
                    </select>

                    <select
                        value={filters?.fkEntrepot ?? ""}
                        onChange={(e) => setFilter("fkEntrepot", e.target.value)}
                        className={selectCls}
                    >
                        <option value="">Tous les entrepôts</option>
                        {(warehouses ?? []).map((w) => (
                            <option key={w.id} value={w.id}>{w.label || w.ref}</option>
                        ))}
                    </select>

                    <label className="flex items-center gap-1.5 text-[13px] text-soft-text">
                        <span>Du</span>
                        <input
                            type="date"
                            value={filters?.dateFrom ?? ""}
                            onChange={(e) => setFilter("dateFrom", e.target.value)}
                            className={dateCls}
                        />
                    </label>
                    <label className="flex items-center gap-1.5 text-[13px] text-soft-text">
                        <span>Au</span>
                        <input
                            type="date"
                            value={filters?.dateTo ?? ""}
                            onChange={(e) => setFilter("dateTo", e.target.value)}
                            className={dateCls}
                        />
                    </label>
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
                    <div className="p-8 text-center text-gray-500 text-[13px]">Aucun mouvement</div>
                ) : (
                    <table className="w-full border-collapse text-[13px]">
                        <thead className="sticky top-0 z-10 bg-medium-bg/60">
                            <tr className="text-left text-soft-text">
                                <th className="font-medium px-4 py-2 w-44">Date</th>
                                <th className="font-medium px-4 py-2">Produit</th>
                                <th className="font-medium px-4 py-2 w-48">Entrepôt</th>
                                <th className="font-medium px-4 py-2">Motif</th>
                                <th className="font-medium px-4 py-2 w-28 text-right">Quantité</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((m) => {
                                const qty = Number(m.value ?? 0);
                                const isInput = qty >= 0;
                                return (
                                    <tr
                                        key={m.id}
                                        className="border-b border-soft-border/60 hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-4 py-1.5 text-soft-text whitespace-nowrap">{formatDate(m.datem)}</td>
                                        <td className="px-4 py-1.5 text-strong-text truncate max-w-0">
                                            <span className="block truncate">{productLabel(m.fkProduct)}</span>
                                        </td>
                                        <td className="px-4 py-1.5 text-strong-text whitespace-nowrap">{warehouseLabel(m.fkEntrepot)}</td>
                                        <td className="px-4 py-1.5 text-gray-500 italic truncate max-w-0">
                                            <span className="block truncate">{m.label || ""}</span>
                                        </td>
                                        <td className={`px-4 py-1.5 text-right font-semibold tabular-nums ${isInput ? "text-green-600" : "text-red-600"}`}>
                                            <span className="inline-flex items-center justify-end gap-1">
                                                {isInput
                                                    ? <FaArrowUp className="text-[10px]" />
                                                    : <FaArrowDown className="text-[10px]" />}
                                                {isInput ? "+" : ""}{qty}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default StockMovementsPageDesktop;
