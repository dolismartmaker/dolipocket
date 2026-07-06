import { FaMagnifyingGlass, FaXmark } from "react-icons/fa6";

import { TextFilter } from "./filters/TextFilter";
import { SelectFilter } from "./filters/SelectFilter";
import { DateRangeFilter } from "./filters/DateRangeFilter";
import { NumberRangeFilter } from "./filters/NumberRangeFilter";
import { BooleanFilter } from "./filters/BooleanFilter";

// Filter row, one cell per visible column. Empty cell when the column has
// no `filter` configured. Saisies are LOCAL (draftFilters) until the user
// clicks the magnifier icon (or presses Enter inside any input). The cross
// icon next to the magnifier resets all filters (Dolibarr UI convention).

const renderFilter = (col, value, onChange, onSubmit) => {
    const def = col.filter;
    if (!def) return null;
    const kind = typeof def === "string" ? def : def.kind;

    switch (kind) {
        case "text":
            return <TextFilter value={value} onChange={onChange} onSubmit={onSubmit} placeholder="" />;
        case "select":
            return <SelectFilter value={value} onChange={onChange} onSubmit={onSubmit} options={def.options} />;
        case "daterange":
            return <DateRangeFilter value={value} onChange={onChange} onSubmit={onSubmit} />;
        case "numberrange":
            return <NumberRangeFilter value={value} onChange={onChange} onSubmit={onSubmit} />;
        case "boolean":
            return <BooleanFilter value={value} onChange={onChange} onSubmit={onSubmit} />;
        case "custom":
            if (typeof def.Component === "function") {
                const C = def.Component;
                return <C value={value} onChange={onChange} onSubmit={onSubmit} />;
            }
            return null;
        default:
            return null;
    }
};

export const FilterRow = ({
    columns,
    draftFilters,
    onDraftChange,
    hasActions,
    actionsWidth,
    stickyLeftOffsets,
    isConfigMode,
    onSubmit,
    onReset,
}) => {
    if (isConfigMode) return null;

    // Wrapped in its own <tbody>: a bare <tr> as a direct child of <table>
    // is invalid DOM nesting (React hydration warning). Multiple <tbody> in
    // one table is valid HTML; the horizontal sticky lives on the <td>, so
    // this wrapper changes nothing visually.
    return (
        <tbody>
        <tr>
            <td
                style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 4,
                    width: 36,
                    minWidth: 36,
                    maxWidth: 36,
                    height: 28,
                    background: "#fff",
                    borderBottom: "1px solid #e5e7eb",
                }}
            />
            {columns.map((col) => {
                if (col.visible === false) return null;
                const stickyLeft = stickyLeftOffsets[col.key];
                const stickyStyle = typeof stickyLeft === "number"
                    ? { position: "sticky", left: stickyLeft, zIndex: 3, background: "#fff" }
                    : { background: "#fff" };
                return (
                    <td
                        key={col.key}
                        style={{
                            width: col.width,
                            minWidth: col.width,
                            maxWidth: col.width,
                            height: 28,
                            padding: "1px 4px",
                            borderBottom: "1px solid #e5e7eb",
                            ...stickyStyle,
                        }}
                    >
                        {renderFilter(
                            col,
                            draftFilters?.[col.key],
                            (v) => onDraftChange(col.key, v),
                            onSubmit,
                        )}
                    </td>
                );
            })}
            {/* Filler cell: absorbs horizontal slack (see Row.jsx). */}
            <td
                aria-hidden="true"
                style={{
                    height: 28,
                    background: "#fff",
                    borderBottom: "1px solid #e5e7eb",
                }}
            />
            {hasActions && (
                <td
                    style={{
                        position: "sticky",
                        right: 0,
                        zIndex: 4,
                        width: actionsWidth,
                        minWidth: actionsWidth,
                        maxWidth: actionsWidth,
                        height: 28,
                        background: "#fff",
                        borderLeft: "1px solid #e5e7eb",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "0 6px",
                    }}
                >
                    <div className="flex items-center justify-end gap-1 h-full">
                        <button
                            type="button"
                            onClick={onSubmit}
                            title="Rechercher"
                            aria-label="Rechercher"
                            className="p-1 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                        >
                            <FaMagnifyingGlass className="text-[12px]" />
                        </button>
                        <button
                            type="button"
                            onClick={onReset}
                            title="Réinitialiser les filtres"
                            aria-label="Réinitialiser les filtres"
                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                        >
                            <FaXmark className="text-[12px]" />
                        </button>
                    </div>
                </td>
            )}
        </tr>
        </tbody>
    );
};
