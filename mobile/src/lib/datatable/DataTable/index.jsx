import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FaSliders, FaPlus } from "react-icons/fa6";

import { useApi, useConfirm } from "@cap-rel/smartcommon";

import { useMenu } from "src/lib/permissions";

import { useDataTablePrefs } from "./hooks/useDataTablePrefs";
import { useDataPipeline } from "./hooks/useDataPipeline";
import { useColumnResize } from "./hooks/useColumnResize";
import { useRowSelection } from "./hooks/useRowSelection";
import { useColumnCatalog } from "./hooks/useColumnCatalog";
import { exportRows as runExport } from "./utils/exportRows";

import { Header } from "./Header";
import { FilterRow } from "./FilterRow";
import { Body } from "./Body";
import { Footer } from "./Footer";
import { BulkActionBar } from "./BulkActionBar";
import { ColumnConfigurator } from "./ColumnConfigurator";

// Public component. Consumed by Page.desktop.jsx files.
//
// Props:
//   config         -- listConfig (shape described in DATATABLE_SPEC.md §5)
//   dataSource     -- { count(params), list(params), listPaged(params) }
//   feature        -- short identifier for export filenames ("contacts", "thirdparties"...)
//   onTotalChange  -- optional callback, invoked with the current `total` count
//                     so the parent page can render "Tiers (24)" in the title.

export const DataTable = ({ config, dataSource, feature, onTotalChange }) => {
    const navigate = useNavigate();
    const api = useApi();
    const { confirm } = useConfirm() ?? {};
    const { has } = useMenu();

    // v2 -- column catalog from the backend mapper. Optional: when a legacy
    // listConfig declares config.columns hardcoded, we don't fetch the
    // catalog at all (backward-compatibility path).
    const catalogEnabled = !Array.isArray(config.columns) && !!feature;
    const { catalog, loading: catalogLoading, error: catalogError } = useColumnCatalog({
        dataSource: catalogEnabled ? dataSource : null,
        feature: catalogEnabled ? feature : null,
    });

    const {
        prefs,
        available,
        resolvedColumns,
        setColumnVisibility,
        setColumnWidth,
        moveColumn,
        setSort: persistSort,
        setPageSize: persistPageSize,
        setSearch: persistSearch,
        setAllFiltersByColumn,
        resetFilters,
        resetAll,
    } = useDataTablePrefs(config, { catalog: catalogEnabled ? catalog : null });

    // Page index is local (not persisted -- behaviour is to start on page 1
    // when entering the page).
    const [page, setPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);

    // Two layers of filter state:
    //   - prefs.filters.byColumn / prefs.filters.search   = APPLIED (= what
    //     the data pipeline sees, persisted, restored at next mount).
    //   - draftFilters                                     = LOCAL (what the
    //     user is typing in the FilterRow, before clicking "Rechercher").
    const [draftSearch, setDraftSearch] = useState(prefs.filters.search ?? "");
    const [draftFilters, setDraftFilters] = useState(prefs.filters.byColumn ?? {});

    // Config mode (drag and drop column reorder + visibility checkboxes).
    const [isConfigMode, setIsConfigMode] = useState(false);

    // Apply current filter draft.
    const handleApplyFilters = useCallback(() => {
        persistSearch(draftSearch);
        setAllFiltersByColumn(draftFilters);
        setPage(1);
    }, [draftSearch, draftFilters, persistSearch, setAllFiltersByColumn]);

    // Reset draft + applied filters.
    const handleResetFilters = useCallback(() => {
        setDraftSearch("");
        setDraftFilters({});
        resetFilters();
        setPage(1);
    }, [resetFilters]);

    const handleResetAll = useCallback(() => {
        resetAll();
        setDraftSearch("");
        setDraftFilters({});
        setPage(1);
    }, [resetAll]);

    // Sort toggle: asc -> desc -> none -> asc ...
    const handleSortToggle = useCallback((colKey) => {
        const cur = prefs.sort;
        let next;
        if (!cur || cur.col !== colKey) {
            next = { col: colKey, order: "asc" };
        } else if (cur.order === "asc") {
            next = { col: colKey, order: "desc" };
        } else {
            next = config.defaultSort
                ? { col: config.defaultSort.col, order: config.defaultSort.order ?? "asc" }
                : null;
        }
        persistSort(next);
        setPage(1);
    }, [prefs.sort, config.defaultSort, persistSort]);

    // Resize.
    const resize = useColumnResize({ onCommit: setColumnWidth });

    // List of column keys to request from the server (via ?include=). We
    // ship only the visible ones so the backend can skip mapping the rest.
    // _rownum is purely client-side (numbering) -- never include it.
    const includeKeys = useMemo(
        () => resolvedColumns
            .filter((c) => c.visible !== false && c.key !== "_rownum")
            .map((c) => c.key),
        [resolvedColumns],
    );

    // Pipeline. Gives back rows for the current page + total count.
    const pipeline = useDataPipeline({
        source: dataSource,
        resolvedColumns,
        appliedFilters: prefs.filters,
        sort: prefs.sort,
        page,
        limit: prefs.pageSize,
        clientThreshold: config.clientThreshold ?? 5000,
        refreshKey,
        includeKeys,
    });

    const purgeKey = useMemo(
        () => JSON.stringify({ f: prefs.filters, s: prefs.sort, p: page, l: prefs.pageSize }),
        [prefs.filters, prefs.sort, page, prefs.pageSize],
    );

    const rowKey = config.rowKey ?? ((row) => row.id);

    const selection = useRowSelection({
        rows: pipeline.rows,
        rowKeyFn: rowKey,
        purgeKey,
    });

    // Compute sticky-left offsets for the header / filter / row cells.
    // The first sticky data column begins right after the # rownum column.
    // Layout from the left: [checkbox 36] [#? optional] [first data column].
    const stickyLeftOffsets = useMemo(() => {
        const offsets = {};
        let leftAcc = 36; // the select column

        const visibleCols = resolvedColumns.filter((c) => c.visible !== false);

        // # rownum (if visible AND first)
        if (visibleCols.length > 0 && visibleCols[0].key === "_rownum") {
            offsets["_rownum"] = leftAcc;
            leftAcc += visibleCols[0].width;
            // First data column = the next one if it exists.
            if (visibleCols[1]) {
                offsets[visibleCols[1].key] = leftAcc;
            }
        } else if (visibleCols[0]) {
            // If # is hidden, the first visible column is the first data column.
            offsets[visibleCols[0].key] = leftAcc;
        }
        return offsets;
    }, [resolvedColumns]);

    // Refresh helper passed to action callbacks.
    const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    // Export helper (exposed via ctx). WYSIWYG: current page rows + visible columns.
    const exportRows = useCallback(async (format) => {
        const cols = resolvedColumns.filter((c) => c.visible !== false);
        try {
            await runExport(pipeline.rows, cols, format, feature ?? "export");
        } catch (err) {
            console.error("[DataTable] export error", err);
            toast.error("Export impossible");
        }
    }, [pipeline.rows, resolvedColumns, feature]);

    const ctx = useMemo(() => ({
        navigate,
        api: api.private,
        refresh,
        toast,
        confirm,
        exportRows,
    }), [navigate, api.private, refresh, confirm, exportRows]);

    // Cap the page if total shrinks (e.g. after a delete).
    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(pipeline.total / prefs.pageSize));
        if (page > totalPages) setPage(totalPages);
    }, [pipeline.total, prefs.pageSize, page]);

    // Surface total to the parent so it can render "Title (N)".
    useEffect(() => {
        if (typeof onTotalChange !== "function") return;
        if (pipeline.loading) return;
        onTotalChange(pipeline.total);
    }, [pipeline.total, pipeline.loading, onTotalChange]);

    // Filter every action set by the user's permissions. An action without
    // a `permission` field is always shown (covers view, export, etc.).
    // Filtering happens once, here, so downstream layout (sticky offsets,
    // actions column width) sees the post-filter list.
    const headerActions = (config.headerActions ?? []).filter((a) => has(a.permission));
    const rowActions = (config.rowActions ?? []).filter((a) => has(a.permission));
    const rowKebabActions = (config.rowKebabActions ?? []).filter((a) => has(a.permission));
    const bulkActions = (config.bulkActions ?? []).filter((a) => has(a.permission));
    const hasRowActions = rowActions.length > 0 || rowKebabActions.length > 0;

    // Width reserved for the right sticky actions column. Compute roughly:
    // 28px per row action icon + 28px for the kebab + 8px padding.
    const actionsWidth = useMemo(() => {
        if (!hasRowActions) return 0;
        const iconCount = rowActions.length + (rowKebabActions.length > 0 ? 1 : 0);
        return Math.max(80, 16 + iconCount * 30);
    }, [hasRowActions, rowActions, rowKebabActions]);

    const onRowClick = config.rowClick === false
        ? null
        : (row) => {
            const view = rowActions.find((a) => a.key === "view");
            if (view?.onClick) view.onClick(row, ctx);
        };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            {/* Toolbar: optional global search input, headerActions (e.g. "Nouveau tiers"),
                column configurator. Search/Reset are NOT here -- they live as
                magnifier/cross icons inside the FilterRow itself, Dolibarr-style. */}
            <div className="shrink-0 flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-gray-200 bg-white">
                {config.globalSearch && (
                    <input
                        type="search"
                        value={draftSearch}
                        onChange={(e) => setDraftSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleApplyFilters(); }}
                        placeholder={config.globalSearch.placeholder ?? "Rechercher..."}
                        className="px-2 h-[26px] text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:border-primary w-[260px]"
                    />
                )}

                <span className="flex-1" />

                {headerActions.map((act) => {
                    const Icon = act.icon ?? FaPlus;
                    return (
                        <button
                            key={act.key}
                            type="button"
                            onClick={() => act.onClick?.(ctx)}
                            className={`h-[26px] px-3 rounded text-[12px] flex items-center gap-1 ${act.primary ? "bg-primary text-white hover:bg-primary/90" : "bg-white border border-gray-200 hover:bg-gray-50"}`}
                        >
                            <Icon className="text-[11px]" />
                            <span>{act.label}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setIsConfigMode((v) => !v)}
                    className={`h-[26px] px-3 rounded text-[12px] flex items-center gap-1 border ${isConfigMode ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                    title="Choisir les colonnes à afficher, réordonner par drag & drop"
                    aria-label="Configurer les colonnes"
                >
                    <FaSliders className="text-[11px]" />
                    <span>Colonnes</span>
                </button>
            </div>

            {isConfigMode && (
                <ColumnConfigurator
                    available={available}
                    prefsColumns={prefs.columns}
                    onVisibilityToggle={setColumnVisibility}
                    onMove={moveColumn}
                    onClose={() => setIsConfigMode(false)}
                    onReset={handleResetAll}
                />
            )}

            {catalogEnabled && !catalog && !catalogLoading && (
                <div className="shrink-0 px-3 py-1.5 text-[12px] text-amber-900 bg-amber-50 border-b border-amber-200">
                    Catalogue de colonnes indisponible{catalogError ? " (erreur réseau)" : ""}, fonctionnalités limitées.
                </div>
            )}

            {/* Scrollable container: horizontal AND vertical scroll inside
                this box. The toolbar above and footer below stay pinned. */}
            <div className="flex-1 min-h-0 overflow-auto">
                <table
                    className="border-collapse"
                    style={{
                        tableLayout: "fixed",
                        borderSpacing: 0,
                        minWidth: "100%",
                    }}
                >
                    <Header
                        columns={resolvedColumns}
                        sort={prefs.sort}
                        onSortToggle={handleSortToggle}
                        isConfigMode={isConfigMode}
                        resize={resize}
                        selection={selection}
                        hasActions={hasRowActions}
                        actionsWidth={actionsWidth}
                        stickyLeftOffsets={stickyLeftOffsets}
                        rowsForAutoFit={pipeline.rows}
                    />
                    <FilterRow
                        columns={resolvedColumns}
                        draftFilters={draftFilters}
                        onDraftChange={(col, v) => setDraftFilters((s) => ({ ...s, [col]: v }))}
                        hasActions={hasRowActions}
                        actionsWidth={actionsWidth}
                        stickyLeftOffsets={stickyLeftOffsets}
                        isConfigMode={isConfigMode}
                        onSubmit={handleApplyFilters}
                        onReset={handleResetFilters}
                    />
                    <Body
                        rows={pipeline.rows}
                        columns={resolvedColumns}
                        page={page}
                        pageSize={prefs.pageSize}
                        rowKey={rowKey}
                        selection={selection}
                        rowActions={rowActions}
                        rowKebabActions={rowKebabActions}
                        onRowClick={onRowClick}
                        actionsWidth={actionsWidth}
                        stickyLeftOffsets={stickyLeftOffsets}
                        ctx={ctx}
                        loading={pipeline.loading}
                        error={pipeline.error}
                        onRetry={refresh}
                    />
                </table>
            </div>

            <Footer
                page={page}
                pageSize={prefs.pageSize}
                pageSizeOptions={config.pageSizeOptions ?? [25, 50, 100]}
                onPageSizeChange={(s) => { persistPageSize(s); setPage(1); }}
                total={pipeline.total}
                onPageChange={setPage}
            />

            <BulkActionBar
                selectedRows={selection.selectedRows}
                bulkActions={bulkActions}
                onClear={selection.clear}
                ctx={ctx}
            />
        </div>
    );
};
