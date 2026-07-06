import { useCallback, useMemo, useState } from "react";

// Per-user cockpit layout preferences (order / visibility / width / collapse /
// list length), resolved against a box registry (cf layoutRegistry.js).
//
// Persistence is HYBRID by design: the hook talks to an *adapter* with a
// { load, save, clear } contract. The default adapter is localStorage (per
// browser, zero backend, ships today); a server adapter (per user, cross
// device) can be injected later WITHOUT touching this hook or the UI -- that is
// the whole point of the indirection.
//
// Prefs shape persisted:
//   { v, order: [id...], overrides: { [id]: { visible, width, collapsed, limit } } }
// Only non-default deviations live in `overrides`; the registry provides the
// defaults. Unknown ids are dropped on read, new registry ids are appended --
// so the registry can evolve without corrupting a user's saved layout.

const PREFS_VERSION = 1;

const emptyPrefs = () => ({ v: PREFS_VERSION, order: [], overrides: {} });

// localStorage-backed adapter. Every branch logs before failing quietly so a
// full quota / private-mode error never crashes the cockpit.
export const localStorageAdapter = (key) => ({
    load() {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (err) {
            console.error("useCockpitLayout: prefs load failed", err);
            return null;
        }
    },
    save(prefs) {
        try {
            localStorage.setItem(key, JSON.stringify(prefs));
        } catch (err) {
            console.error("useCockpitLayout: prefs save failed", err);
        }
    },
    clear() {
        try {
            localStorage.removeItem(key);
        } catch (err) {
            console.error("useCockpitLayout: prefs clear failed", err);
        }
    },
});

export const useCockpitLayout = ({ feature, boxes, adapter }) => {
    const store = useMemo(
        () => adapter || localStorageAdapter(`dolipocket.cockpit.${feature}`),
        [adapter, feature],
    );

    const [prefs, setPrefs] = useState(() => {
        const loaded = store.load();
        return loaded && loaded.v === PREFS_VERSION ? loaded : emptyPrefs();
    });
    const [editMode, setEditMode] = useState(false);

    // Materialize the effective display order from stored order + registry:
    // known stored ids first (in their saved order), then any registry id not
    // yet seen (new boxes land at the end).
    const computeOrder = useCallback(
        (source) => {
            const known = boxes.map((b) => b.id);
            const ordered = [];
            for (const id of source.order || []) {
                if (known.includes(id) && !ordered.includes(id)) ordered.push(id);
            }
            for (const id of known) {
                if (!ordered.includes(id)) ordered.push(id);
            }
            return ordered;
        },
        [boxes],
    );

    // Write helper: compute next prefs from the latest state, then persist. The
    // save runs inside the updater so it always sees the value we commit.
    const mutate = useCallback(
        (fn) => {
            setPrefs((prev) => {
                const next = fn(prev);
                if (next === prev) return prev;
                store.save(next);
                return next;
            });
        },
        [store],
    );

    const overrideOf = (source, id) => (source.overrides || {})[id] || {};

    const patchOverride = (source, id, patch) => ({
        ...source,
        v: PREFS_VERSION,
        overrides: {
            ...source.overrides,
            [id]: { ...overrideOf(source, id), ...patch },
        },
    });

    // --- resolved boxes: registry merged with prefs, in display order ---------
    const resolved = useMemo(() => {
        const byId = new Map(boxes.map((b) => [b.id, b]));
        return computeOrder(prefs).map((id) => {
            const box = byId.get(id);
            const ov = overrideOf(prefs, id);
            return {
                ...box,
                visible: ov.visible !== undefined ? ov.visible : box.defaultVisible !== false,
                width: ov.width || box.defaultWidth || "normal",
                collapsed: ov.collapsed !== undefined ? ov.collapsed : false,
                limit: ov.limit !== undefined ? ov.limit : (box.defaultLimit ?? null),
            };
        });
    }, [boxes, prefs, computeOrder]);

    // --- mutations ------------------------------------------------------------

    // Move `fromId` so it sits right before `toId` (drop-onto-target semantics,
    // matching the DataTable ColumnConfigurator).
    const moveBox = useCallback(
        (fromId, toId) => {
            if (!fromId || !toId || fromId === toId) return;
            mutate((prev) => {
                const order = computeOrder(prev);
                const from = order.indexOf(fromId);
                if (from < 0 || order.indexOf(toId) < 0) return prev;
                order.splice(from, 1);
                const insertAt = order.indexOf(toId);
                order.splice(insertAt, 0, fromId);
                return { ...prev, v: PREFS_VERSION, order };
            });
        },
        [mutate, computeOrder],
    );

    const isVisible = (source, id) => {
        const ov = overrideOf(source, id);
        if (ov.visible !== undefined) return ov.visible;
        const box = boxes.find((b) => b.id === id);
        return box ? box.defaultVisible !== false : true;
    };

    const toggleVisible = useCallback(
        (id) => mutate((prev) => patchOverride(prev, id, { visible: !isVisible(prev, id) })),
        [mutate],
    );

    const show = useCallback(
        (id) => mutate((prev) => patchOverride(prev, id, { visible: true })),
        [mutate],
    );

    const setWidth = useCallback(
        (id, width) => mutate((prev) => patchOverride(prev, id, { width })),
        [mutate],
    );

    const toggleWidth = useCallback(
        (id) =>
            mutate((prev) => {
                const cur = overrideOf(prev, id).width
                    || boxes.find((b) => b.id === id)?.defaultWidth
                    || "normal";
                return patchOverride(prev, id, { width: cur === "full" ? "normal" : "full" });
            }),
        [mutate, boxes],
    );

    const toggleCollapsed = useCallback(
        (id) =>
            mutate((prev) => {
                const cur = overrideOf(prev, id).collapsed === true;
                return patchOverride(prev, id, { collapsed: !cur });
            }),
        [mutate],
    );

    const setLimit = useCallback(
        (id, limit) => mutate((prev) => patchOverride(prev, id, { limit })),
        [mutate],
    );

    const resetAll = useCallback(() => {
        const next = emptyPrefs();
        setPrefs(next);
        store.save(next);
    }, [store]);

    return {
        resolved,
        editMode,
        setEditMode,
        moveBox,
        toggleVisible,
        show,
        setWidth,
        toggleWidth,
        toggleCollapsed,
        setLimit,
        resetAll,
    };
};
