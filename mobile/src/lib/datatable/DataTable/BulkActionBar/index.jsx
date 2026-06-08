import { FaXmark } from "react-icons/fa6";

// Sticky bottom bar that appears with a slide-up animation when at least
// one row is selected. Hosts the bulk actions defined in listConfig.

export const BulkActionBar = ({
    selectedRows,
    bulkActions,
    onClear,
    ctx,
}) => {
    const visible = (selectedRows?.length ?? 0) > 0;

    return (
        <div
            className="fixed left-1/2 bottom-4 z-30 transition-[transform,opacity] duration-200"
            style={{
                transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(120%)",
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
            }}
        >
            <div className="bg-white border border-gray-200 shadow-xl rounded-xl px-4 py-2.5 flex items-center gap-3">
                <span className="text-[13px] font-medium text-gray-700">
                    {selectedRows?.length ?? 0} sélectionné{(selectedRows?.length ?? 0) > 1 ? "s" : ""}
                </span>
                <span className="w-px h-6 bg-gray-200" />
                {(bulkActions ?? []).map((act) => {
                    const Icon = act.icon;
                    return (
                        <button
                            key={act.key}
                            type="button"
                            onClick={async () => {
                                if (act.confirm) {
                                    const cfg = typeof act.confirm === "function"
                                        ? act.confirm({ selected: selectedRows })
                                        : act.confirm;
                                    if (ctx?.confirm) {
                                        const ok = await ctx.confirm(cfg);
                                        if (!ok) return;
                                    } else if (typeof window !== "undefined" && !window.confirm(cfg.title ?? "Confirmer ?")) {
                                        return;
                                    }
                                }
                                await act.run?.(selectedRows, ctx);
                            }}
                            className={`px-3 py-1.5 rounded text-[13px] font-medium flex items-center gap-1.5 ${act.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"}`}
                            title={act.label}
                        >
                            {Icon && <Icon className="text-[12px]" />}
                            <span>{act.label}</span>
                        </button>
                    );
                })}
                <span className="w-px h-6 bg-gray-200" />
                <button
                    type="button"
                    onClick={onClear}
                    className="p-1 text-gray-500 hover:text-gray-700"
                    title="Annuler la sélection"
                    aria-label="Annuler la sélection"
                >
                    <FaXmark className="text-[14px]" />
                </button>
            </div>
        </div>
    );
};
