import { FaXmark, FaPlus, FaMinus } from "react-icons/fa6";

// Stock adjustment modal (desktop). Pre-filled with the product being adjusted
// and the warehouse currently selected in the toolbar. Quantity + optional
// reason, then "Sortie" (-) or "Entrée" (+) records a movement.
//
// Presentational only -- the adjustment state + submit handler come from
// useStockData() via props. `product` (the hook's `adjusting`) drives
// visibility: null -> not rendered.
//
// Props:
//   product       object   Required to render. The product being adjusted.
//   warehouse     object   The target warehouse (resolved from warehouseId).
//   adjQty        string
//   adjLabel      string
//   saving        bool
//   set           fn       Hook setter (set("adjQty", v) / set("adjLabel", v)).
//   onSubmit      fn       submitAdjust(sign) with sign = +1 / -1.
//   onClose       fn       cancelAdjust().
export const StockAdjustModal = ({ product, warehouse, adjQty, adjLabel, saving, set, onSubmit, onClose }) => {
    if (!product) return null;

    const inputCls = "h-[34px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none w-full";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl border border-soft-border shadow-lg w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border">
                    <h2 className="text-sm font-semibold text-strong-text truncate pr-2">
                        Ajuster le stock - {product.label}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg transition-colors shrink-0"
                        aria-label="Fermer"
                    >
                        <FaXmark className="text-sm" />
                    </button>
                </header>

                <div className="px-4 py-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-[13px]">
                        <span className="text-soft-text">{product.ref}</span>
                        <span className="text-strong-text">
                            Stock actuel : <strong>{Number(product.stockReel ?? 0)}</strong>
                        </span>
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Entrepôt</span>
                        <div className="h-[34px] px-2 rounded border border-soft-border bg-medium-bg/40 text-[13px] flex items-center text-strong-text">
                            {warehouse ? (warehouse.label || warehouse.ref) : "Aucun entrepôt sélectionné"}
                        </div>
                    </div>

                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Quantité</span>
                        <input
                            type="number"
                            step="0.01"
                            value={String(adjQty ?? "")}
                            onChange={(e) => set("adjQty", e.target.value)}
                            className={inputCls}
                            autoFocus
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Motif (optionnel)</span>
                        <input
                            type="text"
                            value={adjLabel ?? ""}
                            onChange={(e) => set("adjLabel", e.target.value)}
                            className={inputCls}
                        />
                    </label>
                </div>

                <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-soft-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-[32px] px-3 rounded text-[12px] bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={() => onSubmit(-1)}
                        disabled={saving}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                    >
                        <FaMinus className="text-[11px]" />
                        <span>Sortie</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onSubmit(1)}
                        disabled={saving}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        <FaPlus className="text-[11px]" />
                        <span>Entrée</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default StockAdjustModal;
