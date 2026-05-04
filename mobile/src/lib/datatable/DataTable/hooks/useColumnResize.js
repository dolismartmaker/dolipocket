import { useCallback, useEffect, useRef, useState } from "react";

// Column resize via drag of the right border of each header cell.
//
// Behaviour (cf DATATABLE_SPEC.md §7.8):
// - Live preview during the drag (local state only, no persist).
// - Persist via setColumnWidth() on mouseup.
// - Min 50, max 800.
// - Double-click on the resize zone -> auto-fit (max of header label length
//   and the longest visible cell content for that column on the current page).

const MIN_WIDTH = 50;
const MAX_WIDTH = 800;
const HEADER_PADDING_PX = 24;
const CELL_PADDING_PX = 16;
const CHAR_WIDTH_PX = 7;

const clamp = (n) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));

export const useColumnResize = ({ onCommit }) => {
    const [drag, setDrag] = useState(null);
    // {colKey, startX, startWidth, currentWidth}
    const dragRef = useRef(drag);
    dragRef.current = drag;

    useEffect(() => {
        if (!drag) return undefined;

        const handleMove = (e) => {
            const cur = dragRef.current;
            if (!cur) return;
            const delta = e.clientX - cur.startX;
            const next = clamp(cur.startWidth + delta);
            setDrag({ ...cur, currentWidth: next });
        };

        const handleUp = () => {
            const cur = dragRef.current;
            if (cur && typeof onCommit === "function") {
                onCommit(cur.colKey, cur.currentWidth);
            }
            setDrag(null);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [drag, onCommit]);

    const startResize = useCallback((colKey, startX, startWidth) => {
        setDrag({ colKey, startX, startWidth, currentWidth: startWidth });
    }, []);

    const previewWidth = useCallback((colKey, fallback) => {
        if (drag && drag.colKey === colKey) return drag.currentWidth;
        return fallback;
    }, [drag]);

    const autoFit = useCallback((colKey, label, rows) => {
        let maxLen = String(label ?? "").length;
        for (const row of rows ?? []) {
            const v = row?.[colKey];
            if (v === null || v === undefined) continue;
            const s = String(v);
            if (s.length > maxLen) maxLen = s.length;
            if (maxLen > 80) {
                maxLen = 80;
                break;
            }
        }
        const px = Math.max(
            String(label ?? "").length * CHAR_WIDTH_PX + HEADER_PADDING_PX,
            maxLen * CHAR_WIDTH_PX + CELL_PADDING_PX,
        );
        const final = clamp(px);
        if (typeof onCommit === "function") onCommit(colKey, final);
    }, [onCommit]);

    return {
        isDragging: !!drag,
        draggingColumn: drag?.colKey ?? null,
        startResize,
        previewWidth,
        autoFit,
    };
};
