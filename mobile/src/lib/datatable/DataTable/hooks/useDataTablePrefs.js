import { useCallback, useEffect, useMemo, useState } from "react";

// Persist DataTable user preferences (column visibility, order, widths, sort,
// page size, filters) under a single localStorage key. Pages provide the key
// via listConfig.storageKey.
//
// Shape persisted (cf DATATABLE_SPEC.md §6):
//   {
//     columns: [{key, visible, width}, ...],   // order = display order
//     sort:    {col, order},
//     pageSize: number,
//     filters: { search: string, byColumn: { [col]: string } }
//   }
//
// v2 (DATATABLE_SPEC.md §13) -- the source of truth for "which columns
// exist" is the server-side catalog, merged with `columnsOverrides` from
// the listConfig and the persisted prefs. v1 (with `config.columns`
// hardcoded) is still supported as a fallback when the catalog is not
// available -- e.g. offline + no cache, or legacy consumers not yet migrated.
//
// Merge rules (v2):
// - Final list of columns = `_rownum` (injected) + catalog columns.
// - For each catalog column:
//     - if present in localStorage prefs    -> use stored visible / width / order
//     - else (newly arrived in the catalog) -> use defaults from
//           columnsOverrides[key] then the catalog itself.
// - Columns present in localStorage but no longer in the catalog are
//   dropped silently (server retired the field).
// - Order: the prefs order is respected for the columns it knows; new
//   columns are appended to the end.
//
// Backward-compatible fallback (v1):
// - When catalog is null and config.columns is provided, behave exactly
//   like the v1 implementation (single source = config.columns).

const safeRead = (key) => {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage?.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_e) {
        return null;
    }
};

const safeWrite = (key, value) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage?.setItem(key, JSON.stringify(value));
    } catch (_e) {
        // Storage unavailable (private mode etc.): silently skip.
    }
};

const safeRemove = (key) => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage?.removeItem(key);
    } catch (_e) {
        // ignore
    }
};

// Convert a catalog `filterKind` into the v1 `filter` shape consumed by
// FilterRow / useDataPipeline. When the kind is "select" with options
// embedded, surface them too. Catalog columns with filterable=false yield
// no filter at all. Backward-compat: if the column has no filterKind but
// filterable=true, fall back to "text" (the most common case).
const filterFromCatalog = (col) => {
    if (col.filterable === false) return undefined;
    const kind = col.filterKind;
    if (kind === "select") {
        if (Array.isArray(col.filterOptions) && col.filterOptions.length > 0) {
            return { kind: "select", options: col.filterOptions };
        }
        return { kind: "select", options: [] };
    }
    if (kind === "daterange" || kind === "numberrange" || kind === "boolean" || kind === "text") {
        return kind;
    }
    return col.filterable ? "text" : undefined;
};

// Heuristic default widths when neither the catalog nor the override
// provides one.
const defaultWidthForType = (type) => {
    switch (type) {
        case "boolean": return 80;
        case "int":
        case "float":
        case "number": return 100;
        case "date":
        case "datetime": return 120;
        case "email": return 220;
        default: return 150;
    }
};

const ROWNUM_DEF = {
    key: "_rownum",
    label: "#",
    type: "rownum",
    sortable: false,
    filter: undefined,
    defaultVisible: true,
    defaultWidth: 50,
    group: "system",
};

// Build the canonical "available columns" list from the configured sources.
// v2 path: catalog + columnsOverrides.
// v1 path: config.columns (legacy).
// Degraded path: catalog null and no v1 columns -> derive from
//   columnsOverrides (just enough for the page to render the user-known
//   columns even when the server is unreachable on first launch).
const buildAvailableColumns = ({ catalog, columnsOverrides, legacyColumns }) => {
    if (Array.isArray(catalog)) {
        const overrides = columnsOverrides ?? {};
        const merged = catalog.map((col) => {
            const ov = overrides[col.key] ?? {};
            const filter = filterFromCatalog(col);
            return {
                key: col.key,
                label: col.label,
                type: col.type ?? "string",
                sortable: col.sortable !== false,
                filter: ov.filter ?? filter,
                defaultVisible: ov.defaultVisible !== undefined
                    ? !!ov.defaultVisible
                    : (col.defaultVisible === true),
                defaultWidth: ov.defaultWidth
                    ?? col.defaultWidth
                    ?? defaultWidthForType(col.type),
                formatter: ov.formatter,
                group: col.group ?? "main",
            };
        });
        // _rownum is always available and visible by default; injected
        // first.
        return [ROWNUM_DEF, ...merged];
    }
    // v1 fallback: legacyColumns is the unique source.
    if (Array.isArray(legacyColumns)) {
        return legacyColumns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type ?? "string",
            sortable: c.sortable !== false,
            filter: c.filter,
            defaultVisible: c.defaultVisible !== false,
            defaultWidth: c.defaultWidth ?? defaultWidthForType(c.type),
            formatter: c.formatter,
            group: c.group ?? (c.key === "_rownum" ? "system" : "main"),
        }));
    }
    // Degraded fallback (v2 with no catalog, no cache, no legacy columns):
    // synthesise a minimal column list from the overrides so the user gets
    // SOMETHING visible. Labels are not localised here -- we fall back to
    // capitalising the key.
    if (columnsOverrides && typeof columnsOverrides === "object") {
        const keys = Object.keys(columnsOverrides);
        if (keys.length > 0) {
            const merged = keys.map((key) => {
                const ov = columnsOverrides[key] ?? {};
                return {
                    key,
                    label: ov.label ?? key,
                    type: ov.type ?? "string",
                    sortable: ov.sortable !== false,
                    filter: ov.filter,
                    defaultVisible: ov.defaultVisible !== false,
                    defaultWidth: ov.defaultWidth ?? defaultWidthForType(ov.type),
                    formatter: ov.formatter,
                    group: "main",
                };
            });
            return [ROWNUM_DEF, ...merged];
        }
    }
    return [];
};

const buildDefaultPrefs = (config, available) => {
    const columns = available.map((c) => ({
        key: c.key,
        visible: c.defaultVisible !== false,
        width: c.defaultWidth ?? 150,
    }));
    return {
        columns,
        sort: config.defaultSort
            ? { col: config.defaultSort.col, order: config.defaultSort.order ?? "asc" }
            : null,
        pageSize: config.defaultPageSize ?? 50,
        filters: { search: "", byColumn: {} },
    };
};

const mergePrefsWithStored = (config, available, stored) => {
    const defaults = buildDefaultPrefs(config, available);
    if (!stored || typeof stored !== "object") return defaults;

    const availableKeys = new Set(available.map((c) => c.key));

    // Start with the stored columns that still exist in the catalog
    // (preserves user-chosen order and widths).
    const ordered = [];
    if (Array.isArray(stored.columns)) {
        for (const c of stored.columns) {
            if (c && availableKeys.has(c.key)) {
                const def = defaults.columns.find((d) => d.key === c.key);
                ordered.push({
                    key: c.key,
                    visible: typeof c.visible === "boolean" ? c.visible : (def?.visible ?? true),
                    width: Number.isFinite(c.width) ? c.width : (def?.width ?? 150),
                });
            }
        }
    }

    // Append columns that exist in the catalog but were missing in
    // localStorage (= newly added columns since last save, or first run).
    for (const def of defaults.columns) {
        if (!ordered.some((c) => c.key === def.key)) {
            ordered.push({ ...def });
        }
    }

    return {
        columns: ordered,
        sort: stored.sort && typeof stored.sort === "object"
            ? { col: stored.sort.col, order: stored.sort.order === "desc" ? "desc" : "asc" }
            : defaults.sort,
        pageSize: Number.isFinite(stored.pageSize) ? stored.pageSize : defaults.pageSize,
        filters: {
            search: typeof stored?.filters?.search === "string" ? stored.filters.search : "",
            byColumn: stored?.filters?.byColumn && typeof stored.filters.byColumn === "object"
                ? { ...stored.filters.byColumn }
                : {},
        },
    };
};

export const useDataTablePrefs = (config, { catalog = null } = {}) => {
    const storageKey = config.storageKey;

    // Merged "available columns" (canonical list, before user prefs apply).
    // Recomputed when the catalog arrives or when listConfig changes.
    const available = useMemo(
        () => buildAvailableColumns({
            catalog,
            columnsOverrides: config.columnsOverrides,
            legacyColumns: config.columns,
        }),
        // We intentionally depend on the references; both rebuild infrequently.
        [catalog, config.columnsOverrides, config.columns],
    );

    const [prefs, setPrefsState] = useState(() => {
        const stored = storageKey ? safeRead(storageKey) : null;
        return mergePrefsWithStored(config, available, stored);
    });

    // Re-merge when `available` changes (catalog late-arrives, or listConfig
    // overrides change). We preserve user choices from the live state and
    // append any new columns that the catalog brought in.
    const availableKeysSig = useMemo(
        () => available.map((c) => c.key).join("|"),
        [available],
    );

    useEffect(() => {
        if (!availableKeysSig) return;
        setPrefsState((current) => {
            // If the column list already matches the available set, keep the
            // live state (preserves in-flight reorder / visibility edits).
            const currentKeys = current.columns.map((c) => c.key).join("|");
            if (currentKeys === availableKeysSig) return current;

            // Re-merge using the live prefs as the "stored" baseline so
            // existing user choices are kept, and append the new columns at
            // the end with their defaults.
            return mergePrefsWithStored(config, available, {
                columns: current.columns,
                sort: current.sort,
                pageSize: current.pageSize,
                filters: current.filters,
            });
        });
    }, [availableKeysSig]);

    const persist = useCallback((next) => {
        if (storageKey) safeWrite(storageKey, next);
    }, [storageKey]);

    const setPrefs = useCallback((updater) => {
        setPrefsState((current) => {
            const next = typeof updater === "function" ? updater(current) : updater;
            persist(next);
            return next;
        });
    }, [persist]);

    const setColumnVisibility = useCallback((key, visible) => {
        setPrefs((p) => ({
            ...p,
            columns: p.columns.map((c) => (c.key === key ? { ...c, visible } : c)),
        }));
    }, [setPrefs]);

    const setColumnWidth = useCallback((key, width) => {
        const clamped = Math.max(50, Math.min(800, Math.round(width)));
        setPrefs((p) => ({
            ...p,
            columns: p.columns.map((c) => (c.key === key ? { ...c, width: clamped } : c)),
        }));
    }, [setPrefs]);

    const moveColumn = useCallback((fromKey, toKey) => {
        setPrefs((p) => {
            const fromIdx = p.columns.findIndex((c) => c.key === fromKey);
            const toIdx = p.columns.findIndex((c) => c.key === toKey);
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return p;
            const next = p.columns.slice();
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            return { ...p, columns: next };
        });
    }, [setPrefs]);

    const setSort = useCallback((sort) => {
        setPrefs((p) => ({ ...p, sort }));
    }, [setPrefs]);

    const setPageSize = useCallback((pageSize) => {
        setPrefs((p) => ({ ...p, pageSize }));
    }, [setPrefs]);

    const setSearch = useCallback((search) => {
        setPrefs((p) => ({ ...p, filters: { ...p.filters, search } }));
    }, [setPrefs]);

    const setFilterByColumn = useCallback((col, value) => {
        setPrefs((p) => {
            const byColumn = { ...p.filters.byColumn };
            if (value === undefined || value === null || value === "") {
                delete byColumn[col];
            } else {
                byColumn[col] = value;
            }
            return { ...p, filters: { ...p.filters, byColumn } };
        });
    }, [setPrefs]);

    const setAllFiltersByColumn = useCallback((byColumn) => {
        setPrefs((p) => ({
            ...p,
            filters: { ...p.filters, byColumn: { ...byColumn } },
        }));
    }, [setPrefs]);

    const resetFilters = useCallback(() => {
        setPrefs((p) => ({ ...p, filters: { search: "", byColumn: {} } }));
    }, [setPrefs]);

    const resetAll = useCallback(() => {
        const defaults = buildDefaultPrefs(config, available);
        if (storageKey) safeRemove(storageKey);
        setPrefsState(defaults);
    }, [config, available, storageKey]);

    // Resolved column metadata: merge canonical "available" defs (label, type,
    // filter, formatter, group) with persisted (visible, width, order).
    const resolvedColumns = useMemo(() => {
        const availByKey = new Map(available.map((c) => [c.key, c]));
        return prefs.columns
            .map((p) => {
                const cfg = availByKey.get(p.key);
                if (!cfg) return null;
                return { ...cfg, visible: p.visible, width: p.width };
            })
            .filter(Boolean);
    }, [prefs.columns, available]);

    return {
        prefs,
        available,
        resolvedColumns,
        setColumnVisibility,
        setColumnWidth,
        moveColumn,
        setSort,
        setPageSize,
        setSearch,
        setFilterByColumn,
        setAllFiltersByColumn,
        resetFilters,
        resetAll,
    };
};
