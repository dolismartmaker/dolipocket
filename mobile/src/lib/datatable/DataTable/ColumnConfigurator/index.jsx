import { useMemo, useState } from "react";
import { FaArrowsRotate, FaCheck, FaGripVertical, FaXmark } from "react-icons/fa6";

// Column configurator panel for the DataTable v2 (cf DATATABLE_SPEC.md §13).
//
// Lists EVERY column the catalog exposes (not only the currently visible
// ones), grouped by `group` ('main' / 'extra' / 'extrafield'). For each
// column, the user can:
//   - toggle visibility with a checkbox
//   - reorder by dragging the grip handle (across groups too -- the final
//     order in localStorage is the persisted display order, regardless of
//     the visual grouping)
//
// Reset clears all preferences (visibility, order, widths). Done closes
// the panel; changes are persisted incrementally as the user clicks.
//
// The `_rownum` column is part of the available list but cannot be
// reordered via drag (it stays first) and cannot be hidden via this UI
// either -- the user can still uncheck it directly in the panel since the
// behaviour is consistent with v1, but we suppress the drag handle.

const GROUP_ORDER = ["system", "main", "extra", "extrafield", "other"];

const GROUP_LABELS = {
    system: "Système",
    main: "Principal",
    extra: "Champs étendus",
    extrafield: "Champs personnalisés",
    other: "Autres",
};

// Build groups in the persisted-order visited within each group. We rely on
// `prefsColumns` for the order (so the UI reflects what the user has
// arranged) and on `available` for the metadata.
const buildGroupedRows = (available, prefsColumns) => {
    const availByKey = new Map(available.map((c) => [c.key, c]));
    const orderedKeys = prefsColumns
        .map((c) => c.key)
        .filter((k) => availByKey.has(k));

    // Append catalog columns missing from prefs at the end (shouldn't
    // happen as useDataTablePrefs already merges, but defensive).
    for (const c of available) {
        if (!orderedKeys.includes(c.key)) orderedKeys.push(c.key);
    }

    const groups = new Map();
    for (const key of orderedKeys) {
        const meta = availByKey.get(key);
        const pref = prefsColumns.find((p) => p.key === key);
        const group = meta.group ?? "main";
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push({
            key: meta.key,
            label: meta.label,
            visible: pref ? pref.visible !== false : meta.defaultVisible !== false,
            isSystem: group === "system",
        });
    }

    // Sort groups in a stable, friendly order.
    const ordered = [];
    for (const g of GROUP_ORDER) {
        if (groups.has(g)) ordered.push([g, groups.get(g)]);
    }
    for (const [g, rows] of groups.entries()) {
        if (!GROUP_ORDER.includes(g)) ordered.push([g, rows]);
    }
    return ordered;
};

export const ColumnConfigurator = ({
    available,
    prefsColumns,
    onVisibilityToggle,
    onMove,
    onClose,
    onReset,
}) => {
    const grouped = useMemo(
        () => buildGroupedRows(available ?? [], prefsColumns ?? []),
        [available, prefsColumns],
    );

    // HTML5 drag local state. We keep it scoped to the panel so the same
    // drag never bleeds into the table headers.
    const [draggingKey, setDraggingKey] = useState(null);
    const [hoverKey, setHoverKey] = useState(null);

    const onDragStart = (key) => (e) => {
        setDraggingKey(key);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", key); } catch (_e) { /* ignore */ }
        }
    };

    const onDragEnd = () => {
        setDraggingKey(null);
        setHoverKey(null);
    };

    const onDragOver = (key) => (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (key !== hoverKey) setHoverKey(key);
    };

    const onDrop = (key) => (e) => {
        e.preventDefault();
        const from = draggingKey;
        if (from && from !== key && typeof onMove === "function") {
            onMove(from, key);
        }
        setDraggingKey(null);
        setHoverKey(null);
    };

    return (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 text-[13px] text-amber-900">
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="font-medium">Configurer les colonnes</span>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={onReset}
                    className="px-2.5 py-1 bg-white border border-amber-300 rounded text-[12px] flex items-center gap-1 hover:bg-amber-100"
                    title="Réinitialiser visibilité, ordre et largeurs"
                >
                    <FaArrowsRotate className="text-[11px]" />
                    <span>Réinitialiser</span>
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 bg-primary text-white rounded text-[12px] flex items-center gap-1 hover:bg-primary/90"
                >
                    <FaCheck className="text-[11px]" />
                    <span>Terminer</span>
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-amber-900 hover:bg-amber-100 rounded"
                    title="Fermer"
                    aria-label="Fermer"
                >
                    <FaXmark className="text-[12px]" />
                </button>
            </div>
            <div className="px-3 pb-2 max-h-[40vh] overflow-auto bg-white border-t border-amber-200">
                {grouped.length === 0 && (
                    <div className="py-4 text-center text-gray-500">
                        Aucune colonne disponible.
                    </div>
                )}
                {grouped.map(([groupKey, rows]) => (
                    <div key={groupKey} className="py-2">
                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pb-1">
                            {GROUP_LABELS[groupKey] ?? groupKey}
                        </div>
                        <ul className="flex flex-col">
                            {rows.map((row) => {
                                const draggable = !row.isSystem && typeof onMove === "function";
                                const isHover = hoverKey === row.key;
                                return (
                                    <li
                                        key={row.key}
                                        className={`flex items-center gap-2 px-1 py-1 text-[12px] text-gray-800 rounded ${isHover ? "outline outline-2 outline-primary -outline-offset-2 bg-primary/5" : "hover:bg-gray-50"}`}
                                        draggable={draggable}
                                        onDragStart={draggable ? onDragStart(row.key) : undefined}
                                        onDragEnd={draggable ? onDragEnd : undefined}
                                        onDragOver={draggable ? onDragOver(row.key) : undefined}
                                        onDrop={draggable ? onDrop(row.key) : undefined}
                                    >
                                        <span
                                            className={draggable ? "cursor-grab active:cursor-grabbing text-gray-400" : "text-gray-200"}
                                            title={draggable ? "Glisser pour réordonner" : ""}
                                            aria-hidden="true"
                                        >
                                            <FaGripVertical className="text-[12px]" />
                                        </span>
                                        <input
                                            type="checkbox"
                                            checked={row.visible !== false}
                                            onChange={(e) => onVisibilityToggle?.(row.key, e.target.checked)}
                                            className="cursor-pointer"
                                            aria-label={`Afficher la colonne ${row.label}`}
                                        />
                                        <span className="truncate">{row.label}</span>
                                        <span className="flex-1" />
                                        <span className="text-[10px] text-gray-400 uppercase">{row.key}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};
