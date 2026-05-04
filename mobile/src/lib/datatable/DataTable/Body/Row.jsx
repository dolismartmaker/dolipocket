import { useState } from "react";
import { FaEllipsisVertical } from "react-icons/fa6";

// Coloured pill for boolean-like values (true / "1" / 1 -> green "Oui",
// false / "0" / 0 -> grey "Non"). Matches the Dolibarr "Actif" badge.
const BoolBadge = ({ truthy }) => (
    <span
        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
            truthy
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500"
        }`}
    >
        {truthy ? "Oui" : "Non"}
    </span>
);

const isBooleanColumn = (col) => col?.type === "boolean";

const coerceBool = (v) => {
    if (typeof v === "boolean") return v;
    if (v === 1 || v === "1") return true;
    if (v === 0 || v === "0" || v === null || v === undefined || v === "") return false;
    return Boolean(v);
};

const renderCellContent = (col, row, rowIndexInPage, page, pageSize) => {
    if (col.key === "_rownum") {
        return (page - 1) * pageSize + rowIndexInPage + 1;
    }
    if (typeof col.formatter === "function") {
        try { return col.formatter(row[col.key], row); } catch (_) { return ""; }
    }
    const v = row[col.key];
    if (isBooleanColumn(col)) {
        return <BoolBadge truthy={coerceBool(v)} />;
    }
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return <BoolBadge truthy={v} />;
    return v;
};

export const Row = ({
    row,
    rowIndexInPage,
    page,
    pageSize,
    columns,
    rowKey,
    selected,
    onToggleSelect,
    rowActions,
    rowKebabActions,
    onRowClick,
    actionsWidth,
    stickyLeftOffsets,
    ctx,
}) => {
    const [kebabOpen, setKebabOpen] = useState(false);

    const handleRowMouseDown = (e) => {
        // Only navigate if the click target was the row itself (not buttons).
        if (e.button !== 0) return;
        // Bubbling from interactive children is filtered via `data-row-action`.
        const target = e.target;
        if (target?.closest?.("[data-row-action='1']")) return;
        if (target?.closest?.("input")) return;
        onRowClick?.(row);
    };

    return (
        <tr
            className={`group ${selected ? "bg-primary/5" : "hover:bg-gray-50"}`}
            style={{ height: 28 }}
        >
            <td
                style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    width: 36,
                    minWidth: 36,
                    maxWidth: 36,
                    height: 28,
                    background: selected ? "#eef2ff" : "#fff",
                    borderBottom: "1px solid #f3f4f6",
                    padding: "0 6px",
                }}
                data-row-action="1"
            >
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(row)}
                    aria-label="Sélectionner la ligne"
                    className="cursor-pointer"
                    data-row-action="1"
                />
            </td>
            {columns.map((col, idx) => {
                if (col.visible === false) return null;
                const stickyLeft = stickyLeftOffsets[col.key];
                const stickyStyle = typeof stickyLeft === "number"
                    ? {
                        position: "sticky",
                        left: stickyLeft,
                        zIndex: 1,
                        background: selected ? "#eef2ff" : "#fff",
                    }
                    : {};
                return (
                    <td
                        key={col.key}
                        onMouseDown={handleRowMouseDown}
                        style={{
                            width: col.width,
                            minWidth: col.width,
                            maxWidth: col.width,
                            height: 28,
                            padding: "3px 8px",
                            fontSize: 13,
                            color: "#1f2937",
                            borderBottom: "1px solid #f3f4f6",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: onRowClick ? "pointer" : "default",
                            ...stickyStyle,
                        }}
                        title={(() => {
                            const v = row[col.key];
                            return v === null || v === undefined ? "" : String(v);
                        })()}
                    >
                        {renderCellContent(col, row, rowIndexInPage, page, pageSize)}
                    </td>
                );
            })}
            {(rowActions?.length || rowKebabActions?.length) && (
                <td
                    style={{
                        position: "sticky",
                        right: 0,
                        zIndex: 2,
                        width: actionsWidth,
                        minWidth: actionsWidth,
                        maxWidth: actionsWidth,
                        height: 28,
                        background: selected ? "#eef2ff" : "#fff",
                        borderBottom: "1px solid #f3f4f6",
                        borderLeft: "1px solid #f3f4f6",
                        padding: "0 4px",
                    }}
                    data-row-action="1"
                >
                    <div className="flex items-center justify-end gap-1 h-full">
                        {(rowActions ?? []).map((act) => {
                            const Icon = act.icon;
                            return (
                                <button
                                    key={act.key}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); act.onClick?.(row, ctx); }}
                                    title={act.label}
                                    aria-label={act.label}
                                    className="p-1 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                                    data-row-action="1"
                                >
                                    {Icon ? <Icon className="text-[12px]" /> : <span className="text-[11px]">{act.label}</span>}
                                </button>
                            );
                        })}
                        {(rowKebabActions?.length ?? 0) > 0 && (
                            <div className="relative" data-row-action="1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setKebabOpen((v) => !v); }}
                                    className="p-1 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                                    title="Plus"
                                    aria-label="Plus d'actions"
                                    data-row-action="1"
                                >
                                    <FaEllipsisVertical className="text-[12px]" />
                                </button>
                                {kebabOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-10"
                                            onClick={() => setKebabOpen(false)}
                                        />
                                        <div
                                            className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-[160px] py-1"
                                            data-row-action="1"
                                        >
                                            {rowKebabActions.map((act) => (
                                                <button
                                                    key={act.key}
                                                    type="button"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        setKebabOpen(false);
                                                        if (act.confirm) {
                                                            const confirmCfg = typeof act.confirm === "function"
                                                                ? act.confirm({ row })
                                                                : act.confirm;
                                                            if (ctx?.confirm) {
                                                                const ok = await ctx.confirm(confirmCfg);
                                                                if (!ok) return;
                                                            } else if (typeof window !== "undefined" && !window.confirm(confirmCfg.title ?? "Confirmer ?")) {
                                                                return;
                                                            }
                                                        }
                                                        act.onClick?.(row, ctx);
                                                    }}
                                                    className={`block w-full text-left px-3 py-1.5 text-[13px] hover:bg-gray-100 ${act.danger ? "text-red-600" : "text-gray-700"}`}
                                                    data-row-action="1"
                                                >
                                                    {act.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </td>
            )}
        </tr>
    );
};
