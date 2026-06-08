import { useMemo, useState } from "react";
import { FaArrowsRotate, FaCheck, FaGripVertical, FaXmark } from "react-icons/fa6";

// Embedded panel that lists all the available columns of a lines catalog
// and lets the user toggle visibility + reorder by drag & drop. Same
// interaction model as <ColumnConfigurator> for the listing DataTable, but
// rendered as an inline section header strip rather than a full toolbar.
//
// Used by both <DocumentLinesTable> ("Colonnes" button) and
// <DocumentHeaderFields> ("Champs" button) -- both flavours need the same
// behaviour.

const GROUP_ORDER = ["system", "main", "extra", "extrafield", "other"];

const GROUP_LABELS = {
    system: "Système",
    main: "Principal",
    extra: "Champs étendus",
    extrafield: "Champs personnalisés",
    other: "Autres",
};

const buildGroupedRows = (available, prefsColumns) => {
    const availByKey = new Map(available.map((c) => [c.key, c]));
    const orderedKeys = prefsColumns
        .map((c) => c.key)
        .filter((k) => availByKey.has(k));
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

    const ordered = [];
    for (const g of GROUP_ORDER) {
        if (groups.has(g)) ordered.push([g, groups.get(g)]);
    }
    for (const [g, rows] of groups.entries()) {
        if (!GROUP_ORDER.includes(g)) ordered.push([g, rows]);
    }
    return ordered;
};

export const LinesColumnPanel = ({
    title = "Configurer les colonnes",
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
        <div className="border-b border-amber-200 bg-amber-50 text-[13px] text-amber-900">
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="font-medium">{title}</span>
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
                                            aria-label={`Afficher ${row.label}`}
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
