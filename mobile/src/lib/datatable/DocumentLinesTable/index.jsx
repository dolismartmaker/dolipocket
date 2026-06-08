import { useMemo, useState } from "react";
import { FaSliders } from "react-icons/fa6";

import { useColumnResize } from "../DataTable/hooks/useColumnResize";

import { useLinesCatalog } from "./useLinesCatalog";
import { useDocumentLinesPrefs } from "./useDocumentLinesPrefs";
import { LinesColumnPanel } from "./LinesColumnPanel";

// <DocumentLinesTable> renders the lines of a document (proposal, order,
// invoice, supplier order, supplier invoice) using the same catalog-driven
// approach as the listing <DataTable>: each feature exposes a
// /<feature>/lines/columns endpoint, the catalog is cached locally, and
// the user can choose which columns to display + their order + width via
// an embedded panel ("Colonnes" button).
//
// API contract:
//   <DocumentLinesTable
//       lines={...}        // array of camelCase lines (post mapFromBackend)
//       feature="proposal" // namespace for catalog cache + storageKey
//       dataSource={ds}    // must expose .linesColumns({signal})
//       storageKey="dolipocket.proposalpage.lines"   // localStorage key
//       overrides={{ key: { defaultVisible, defaultWidth, formatter } }}
//       title="Lignes"     // optional, defaults to "Lignes"
//   />
//
// Conventions UI (cf .claude/CLAUDE.md "Conventions UI desktop épurées") :
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (rows 28-32px, padding 6-8px, font 13px)
//   - alternance: just border-b border-soft-border/60 between rows
//   - no transition-all, no hover:shadow-md, no rounded-2xl

const renderCell = (col, row, idx) => {
    if (col.key === "_rownum") return idx + 1;
    const value = row?.[col.key];
    if (typeof col.formatter === "function") {
        try {
            return col.formatter(value, row);
        } catch (e) {
            console.error("[DocumentLinesTable] formatter error", col.key, e);
            return "";
        }
    }
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "";
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    return String(value);
};

const isNumericType = (type) => (
    type === "int"
    || type === "float"
    || type === "number"
    || type === "rownum"
    || type === "double"
);

export const DocumentLinesTable = ({
    lines,
    feature,
    dataSource,
    storageKey,
    overrides,
    title = "Lignes",
}) => {
    const safeLines = Array.isArray(lines) ? lines : [];

    const { catalog, loading: catalogLoading, error: catalogError } = useLinesCatalog({
        dataSource,
        feature,
    });

    const {
        prefs,
        available,
        resolvedColumns,
        setColumnVisibility,
        setColumnWidth,
        moveColumn,
        resetAll,
    } = useDocumentLinesPrefs({ storageKey, catalog, overrides });

    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const visibleColumns = useMemo(
        () => resolvedColumns.filter((c) => c.visible !== false),
        [resolvedColumns],
    );

    const resize = useColumnResize({ onCommit: setColumnWidth });

    return (
        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
            <header className="px-4 py-2.5 border-b border-soft-border flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-strong-text">{title}</h2>
                <span className="flex-1" />
                <span className="text-xs text-soft-text">
                    {safeLines.length} ligne{safeLines.length > 1 ? "s" : ""}
                </span>
                <button
                    type="button"
                    onClick={() => setIsPanelOpen((v) => !v)}
                    className={`h-[26px] px-3 rounded text-[12px] flex items-center gap-1 border ${isPanelOpen ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-soft-border text-strong-text hover:bg-medium-bg"}`}
                    title="Choisir les colonnes à afficher"
                    aria-label="Configurer les colonnes"
                >
                    <FaSliders className="text-[11px]" />
                    <span>Colonnes</span>
                </button>
            </header>

            {isPanelOpen && (
                <LinesColumnPanel
                    title="Colonnes des lignes"
                    available={available}
                    prefsColumns={prefs.columns}
                    onVisibilityToggle={setColumnVisibility}
                    onMove={moveColumn}
                    onClose={() => setIsPanelOpen(false)}
                    onReset={resetAll}
                />
            )}

            {catalogError && !catalog && (
                <div className="px-3 py-1.5 text-[12px] text-amber-900 bg-amber-50 border-b border-amber-200">
                    Catalogue de colonnes indisponible (erreur réseau), affichage par défaut.
                </div>
            )}

            {catalogLoading && safeLines.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-soft-text">
                    Chargement du catalogue...
                </div>
            )}

            {!catalogLoading && safeLines.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-soft-text">
                    Aucune ligne
                </div>
            )}

            {safeLines.length > 0 && visibleColumns.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="border-collapse" style={{ tableLayout: "fixed", borderSpacing: 0, minWidth: "100%" }}>
                        <colgroup>
                            {visibleColumns.map((col) => {
                                const w = resize.previewWidth(col.key, col.width ?? 140);
                                return <col key={col.key} style={{ width: w + "px" }} />;
                            })}
                        </colgroup>
                        <thead>
                            <tr className="border-b border-soft-border bg-medium-bg/40 text-[11px] font-semibold text-soft-text uppercase tracking-wider">
                                {visibleColumns.map((col) => {
                                    const numeric = isNumericType(col.type);
                                    const w = resize.previewWidth(col.key, col.width ?? 140);
                                    return (
                                        <th
                                            key={col.key}
                                            className={`relative px-2 py-2 ${numeric ? "text-right" : "text-left"} font-semibold align-middle`}
                                            style={{ width: w + "px" }}
                                        >
                                            <span className="truncate inline-block max-w-full align-middle">{col.label}</span>
                                            <span
                                                role="separator"
                                                aria-orientation="vertical"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resize.startResize(col.key, e.clientX, w);
                                                }}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resize.autoFit(col.key, col.label, safeLines);
                                                }}
                                                className="absolute top-0 right-0 h-full w-[4px] cursor-col-resize select-none hover:bg-primary/40"
                                                title="Glisser pour redimensionner, double-cliquer pour ajuster"
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {safeLines.map((line, idx) => (
                                <tr
                                    key={line.id ?? idx}
                                    className={`text-[13px] text-strong-text ${idx < safeLines.length - 1 ? "border-b border-soft-border/60" : ""} hover:bg-medium-bg/30`}
                                >
                                    {visibleColumns.map((col) => {
                                        const numeric = isNumericType(col.type);
                                        const w = resize.previewWidth(col.key, col.width ?? 140);
                                        return (
                                            <td
                                                key={col.key}
                                                className={`px-2 py-1.5 ${numeric ? "text-right" : "text-left"} align-top truncate`}
                                                style={{ width: w + "px", maxWidth: w + "px" }}
                                                title={typeof line[col.key] === "string" ? line[col.key] : undefined}
                                            >
                                                {renderCell(col, line, idx)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};
