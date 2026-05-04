import { useCallback, useState } from "react";

// HTML5 drag and drop for column reordering. Active only in config mode
// (cf DATATABLE_SPEC.md §7.7). The drag handle on the header cell wires
// onDragStart/onDragOver/onDrop to these helpers.
//
// onMove(fromKey, toKey) is called when the drop succeeds and triggers the
// persist via useDataTablePrefs.moveColumn().

export const useColumnReorder = ({ onMove }) => {
    const [draggingKey, setDraggingKey] = useState(null);
    const [hoverKey, setHoverKey] = useState(null);

    const onDragStart = useCallback((colKey) => (e) => {
        setDraggingKey(colKey);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            // Some browsers require setData() to actually start a drag.
            try { e.dataTransfer.setData("text/plain", colKey); } catch (_) { /* ignore */ }
        }
    }, []);

    const onDragEnd = useCallback(() => {
        setDraggingKey(null);
        setHoverKey(null);
    }, []);

    const onDragOver = useCallback((colKey) => (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (colKey !== hoverKey) setHoverKey(colKey);
    }, [hoverKey]);

    const onDragLeave = useCallback(() => (e) => {
        e.preventDefault();
        setHoverKey(null);
    }, []);

    const onDrop = useCallback((colKey) => (e) => {
        e.preventDefault();
        const from = draggingKey;
        if (from && from !== colKey && typeof onMove === "function") {
            onMove(from, colKey);
        }
        setDraggingKey(null);
        setHoverKey(null);
    }, [draggingKey, onMove]);

    return {
        draggingKey,
        hoverKey,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
    };
};
