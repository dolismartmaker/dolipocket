import { useCallback, useEffect, useMemo, useState } from "react";

// Multi-row selection on the current page only. Cleared on filter / sort /
// page change (cf DATATABLE_SPEC.md §7.4).
//
// rowKeyFn(row) returns the stable id used as selection key.
// purgeKey is any value that, when changed, clears the selection (we use
// JSON.stringify of {filters, sort, page, limit}).

export const useRowSelection = ({ rows, rowKeyFn, purgeKey }) => {
    const [selectedKeys, setSelectedKeys] = useState(() => new Set());

    // Purge on filter / sort / page change.
    useEffect(() => {
        setSelectedKeys(new Set());
    }, [purgeKey]);

    const isSelected = useCallback((row) => {
        const k = rowKeyFn(row);
        return selectedKeys.has(k);
    }, [selectedKeys, rowKeyFn]);

    const toggle = useCallback((row) => {
        const k = rowKeyFn(row);
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    }, [rowKeyFn]);

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
