import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Multi-row selection on the current page only. Cleared on filter / sort /
// page change (cf DATATABLE_SPEC.md §7.4).
//
// rowKeyFn(row) returns the stable id used as selection key.
// purgeKey is any value that, when changed, clears the selection (we use
// JSON.stringify of {filters, sort, page, limit}).

export const useRowSelection = ({ rows, rowKeyFn, purgeKey }) => {
    const [selectedKeys, setSelectedKeys] = useState(() => new Set());
    // Index of the last row toggled without Shift; anchor for range selection.
    const anchorIndexRef = useRef(null);

    // Purge on filter / sort / page change.
    useEffect(() => {
        setSelectedKeys(new Set());
        anchorIndexRef.current = null;
    }, [purgeKey]);

    const isSelected = useCallback((row) => {
        const k = rowKeyFn(row);
        return selectedKeys.has(k);
    }, [selectedKeys, rowKeyFn]);

    // toggle(row) -> flip a single row.
    // toggle(row, index, shiftKey) -> Shift+click selects the contiguous range
    // between the anchor row and the clicked row (standard list ergonomics).
    const toggle = useCallback((row, index, shiftKey) => {
        if (shiftKey && anchorIndexRef.current != null
            && Array.isArray(rows) && typeof index === "number") {
            const start = Math.min(anchorIndexRef.current, index);
            const end = Math.max(anchorIndexRef.current, index);
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                for (let i = start; i <= end; i++) {
                    const r = rows[i];
                    if (r) next.add(rowKeyFn(r));
                }
                return next;
            });
            return;
        }
        const k = rowKeyFn(row);
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
        if (typeof index === "number") anchorIndexRef.current = index;
    }, [rowKeyFn, rows]);

    const selectAllVisible = useCallback(() => {
        const allKeys = (rows ?? []).map(rowKeyFn);
        setSelectedKeys(new Set(allKeys));
    }, [rows, rowKeyFn]);

    const clear = useCallback(() => {
        setSelectedKeys(new Set());
    }, []);

    const allVisibleSelected = useMemo(() => {
        if (!rows || rows.length === 0) return false;
        for (const row of rows) {
            if (!selectedKeys.has(rowKeyFn(row))) return false;
        }
        return true;
    }, [rows, selectedKeys, rowKeyFn]);

    const someVisibleSelected = useMemo(() => {
        if (!rows || rows.length === 0) return false;
        for (const row of rows) {
            if (selectedKeys.has(rowKeyFn(row))) return true;
        }
        return false;
    }, [rows, selectedKeys, rowKeyFn]);

    const selectedRows = useMemo(() => {
        return (rows ?? []).filter((r) => selectedKeys.has(rowKeyFn(r)));
    }, [rows, selectedKeys, rowKeyFn]);

    const toggleAllVisible = useCallback(() => {
        if (allVisibleSelected) clear();
        else selectAllVisible();
    }, [allVisibleSelected, clear, selectAllVisible]);

    return {
        selectedKeys,
        selectedRows,
        isSelected,
        toggle,
        selectAllVisible,
        toggleAllVisible,
        clear,
        allVisibleSelected,
        someVisibleSelected,
        count: selectedKeys.size,
    };
};
