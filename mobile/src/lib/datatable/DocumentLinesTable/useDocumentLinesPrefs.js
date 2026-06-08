import { useCallback, useEffect, useMemo, useState } from "react";

// Persistence layer for the <DocumentLinesTable> preferences. Mirrors
// useDataTablePrefs but trimmed to what a lines table actually needs:
//   - column visibility
//   - column display order
//   - column widths
// No sort, no pagination, no filters (lines are read-only and shown in
// their natural order by `rang`).
//
// Storage shape (localStorage at `<storageKey>`):
//   { columns: [{key, visible, width}, ...] }
//
// Merge rules:
//   - Final list of columns = `_rownum` (injected) + catalog columns.
//   - For each catalog column:
//       - if present in localStorage prefs    -> use stored visible / width
//       - else (newly arrived in the catalog) -> use defaults from
//             overrides[key] then the catalog itself.
//   - Columns present in localStorage but no longer in the catalog are
//     dropped silently.
//   - Order: prefs order is respected; new columns are appended at the end.

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
        // Storage unavailable: skip silently.
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

const defaultWidthForType = (type) => {
    switch (type) {
        case "boolean": return 80;
        case "int":
        case "float":
        case "number": return 100;
        case "date":
        case "datetime": return 120;
        default: return 140;
    }
};

const ROWNUM_DEF = {
    key: "_rownum",
    label: "#",
    type: "rownum",
    defaultVisible: true,
    defaultWidth: 50,
    group: "system",
};

// Merge catalog + overrides into a canonical "available" list.
const buildAvailableColumns = ({ catalog, overrides }) => {
    if (!Array.isArray(catalog)) {
        // Degraded: if there are overrides, derive a minimal list so the
        // user gets something visible. Labels fall back to the key.
        if (overrides && typeof overrides === "object") {
            const keys = Object.keys(overrides);
            if (keys.length > 0) {
                const merged = keys.map((key) => {
                    const ov = overrides[key] ?? {};
                    return {
                        key,
                        label: ov.label ?? key,
                        type: ov.type ?? "string",
                        defaultVisible: ov.defaultVisible !== false,
                        defaultWidth: ov.defaultWidth ?? defaultWidthForType(ov.type),
                        formatter: ov.formatter,
                        group: "main",
                    };
                });
                return [ROWNUM_DEF, ...merged];
            }
        }
        return [ROWNUM_DEF];
    }
    const ov = overrides ?? {};
    const merged = catalog.map((col) => {
        const o = ov[col.key] ?? {};
        return {
            key: col.key,
            label: o.label ?? col.label,
            type: col.type ?? "string",
            defaultVisible: o.defaultVisible !== undefined
                ? !!o.defaultVisible
                : (col.defaultVisible === true),
            defaultWidth: o.defaultWidth
                ?? col.defaultWidth
                ?? defaultWidthForType(col.type),
            formatter: o.formatter,
            group: col.group ?? "main",
        };
    });
    return [ROWNUM_DEF, ...merged];
};

const buildDefaultPrefs = (available) => ({
    columns: available.map((c) => ({
        key: c.key,
        visible: c.defaultVisible !== false,
        width: c.defaultWidth ?? 140,
    })),
});

const mergePrefsWithStored = (available, stored) => {
    const defaults = buildDefaultPrefs(available);
    if (!stored || typeof stored !== "object") return defaults;

    const availableKeys = new Set(available.map((c) => c.key));
    const ordered = [];

    if (Array.isArray(stored.columns)) {
        for (const c of stored.columns) {
            if (c && availableKeys.has(c.key)) {
                const def = defaults.columns.find((d) => d.key === c.key);
                ordered.push({
                    key: c.key,
                    visible: typeof c.visible === "boolean" ? c.visible : (def?.visible ?? true),
                    width: Number.isFinite(c.width) ? c.width : (def?.width ?? 140),
                });
            }
        }
    }

    // Append columns missing from localStorage.
    for (const def of defaults.columns) {
        if (!ordered.some((c) => c.key === def.key)) {
            ordered.push({ ...def });
        }
    }

    return { columns: ordered };
};

export const useDocumentLinesPrefs = ({ storageKey, catalog, overrides }) => {
    const available = useMemo(
        () => buildAvailableColumns({ catalog, overrides }),
        [catalog, overrides],
    );

    const [prefs, setPrefsState] = useState(() => {
        const stored = storageKey ? safeRead(storageKey) : null;
        return mergePrefsWithStored(available, stored);
    });

    // Re-merge when `available` changes (catalog late-arrives etc).
    const availableKeysSig = useMemo(
        () => available.map((c) => c.key).join("|"),
        [available],
    );

    useEffect(() => {
        if (!availableKeysSig) return;
        setPrefsState((current) => {
            const currentKeys = current.columns.map((c) => c.key).join("|");
            if (currentKeys === availableKeysSig) return current;
            return mergePrefsWithStored(available, {
                columns: current.columns,
            });
        });
    }, [availableKeysSig, available]);

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

    const resetAll = useCallback(() => {
        const defaults = buildDefaultPrefs(available);
        if (storageKey) safeRemove(storageKey);
        setPrefsState(defaults);
    }, [available, storageKey]);

    // Resolved column metadata: merge "available" defs (label, type,
    // formatter) with persisted (visible, width, order).
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
        resetAll,
    };
};
