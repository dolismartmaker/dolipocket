import { useCallback, useEffect, useMemo, useState } from "react";

// Persistence layer for the <DocumentHeaderFields> preferences. Mirrors
// useDocumentLinesPrefs but tailored to a vertical "label : value" list:
//   - field visibility
//   - field display order
// No widths (the layout is always 1 column "label : value").
//
// Storage shape (localStorage at `<storageKey>`):
//   { columns: [{key, visible}, ...] }

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
        // ignore
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

// Build the canonical "available fields" list from the catalog + overrides.
// Header view: no _rownum, no system row at all; we only show data fields.
const buildAvailableFields = ({ catalog, overrides }) => {
    if (!Array.isArray(catalog)) {
        if (overrides && typeof overrides === "object") {
            const keys = Object.keys(overrides);
            if (keys.length > 0) {
                return keys.map((key) => {
                    const ov = overrides[key] ?? {};
                    return {
                        key,
                        label: ov.label ?? key,
                        type: ov.type ?? "string",
                        defaultVisible: ov.defaultVisible !== false,
                        formatter: ov.formatter,
                        group: "main",
                    };
                });
            }
        }
        return [];
    }
    const ov = overrides ?? {};
    return catalog.map((col) => {
        const o = ov[col.key] ?? {};
        return {
            key: col.key,
            label: o.label ?? col.label,
            type: col.type ?? "string",
            defaultVisible: o.defaultVisible !== undefined
                ? !!o.defaultVisible
                : (col.defaultVisible === true),
            formatter: o.formatter,
            group: col.group ?? "main",
        };
    });
};

const buildDefaultPrefs = (available) => ({
    columns: available.map((c) => ({
        key: c.key,
        visible: c.defaultVisible !== false,
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
                });
            }
        }
    }
    for (const def of defaults.columns) {
        if (!ordered.some((c) => c.key === def.key)) {
            ordered.push({ ...def });
        }
    }
    return { columns: ordered };
};

export const useDocumentHeaderPrefs = ({ storageKey, catalog, overrides }) => {
    const available = useMemo(
        () => buildAvailableFields({ catalog, overrides }),
        [catalog, overrides],
    );

    const [prefs, setPrefsState] = useState(() => {
        const stored = storageKey ? safeRead(storageKey) : null;
        return mergePrefsWithStored(available, stored);
    });

    const availableKeysSig = useMemo(
        () => available.map((c) => c.key).join("|"),
        [available],
    );

    useEffect(() => {
        if (!availableKeysSig) return;
        setPrefsState((current) => {
            const currentKeys = current.columns.map((c) => c.key).join("|");
            if (currentKeys === availableKeysSig) return current;
            return mergePrefsWithStored(available, { columns: current.columns });
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

    const resolvedFields = useMemo(() => {
        const availByKey = new Map(available.map((c) => [c.key, c]));
        return prefs.columns
            .map((p) => {
                const cfg = availByKey.get(p.key);
                if (!cfg) return null;
                return { ...cfg, visible: p.visible };
            })
            .filter(Boolean);
    }, [prefs.columns, available]);

    return {
        prefs,
        available,
        resolvedFields,
        setColumnVisibility,
        moveColumn,
        resetAll,
    };
};
