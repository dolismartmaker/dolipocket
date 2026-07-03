import { useCallback, useRef, useState } from "react";

// Pointer-based column reordering for the table headers (desktop).
//
// Why not HTML5 native drag-and-drop: the native API gives an ugly ghost
// image, no live reflow, an imprecise drop target, and it fights with the
// sort click and the resize handle living in the same header cell. Modern
// data grids (Notion, Airtable, Linear) use pointer events instead.
//
// Activation ("press-and-move" / "long press", the most natural gesture):
//   - press the header, then move past MOVE_THRESHOLD px  -> drag starts
//   - or press and hold for HOLD_DELAY_MS without moving   -> drag starts
//   - a quick click without either still toggles the sort (handled by the
//     header's own onClick; we only suppress the click that follows a drag).
//
// While dragging we expose `dragging` = { key, label, pointerX, pointerY,
// indicatorX, beforeKey }. The DataTable renders a floating label chip that
// follows the cursor and a vertical insertion line at `indicatorX`. On drop
// we call onReorder(fromKey, beforeKey) with exact insert-before semantics
// (beforeKey === null => move to the end).

const MOVE_THRESHOLD = 6; // px of movement before a press becomes a drag
const HOLD_DELAY_MS = 180; // press-and-hold delay that also arms the drag

export const useColumnReorder = ({ containerRef, onReorder }) => {
    const [dragging, setDragging] = useState(null);

    // Keys whose next click must be swallowed because it directly follows a
    // completed drag (so we don't accidentally toggle the sort).
    const suppressClickRef = useRef(new Set());

    // Resolve the drop target from the cursor X. We read the live header cell
    // rects (they account for horizontal scroll and sticky columns) and find
    // the first reorderable column whose horizontal midpoint is right of the
    // cursor -> the dragged column would land BEFORE it. Past the last one,
    // beforeKey is null (append) and the indicator sits at its right edge.
    const computeTarget = useCallback((clientX) => {
        const root = containerRef?.current;
        if (!root) return { beforeKey: null, indicatorX: 0 };
        const cells = Array.from(root.querySelectorAll("th[data-dt-col]"))
            .filter((c) => c.getAttribute("data-dt-col") !== "_rownum");
        if (cells.length === 0) return { beforeKey: null, indicatorX: 0 };
        for (const cell of cells) {
            const r = cell.getBoundingClientRect();
            if (clientX < r.left + r.width / 2) {
                return { beforeKey: cell.getAttribute("data-dt-col"), indicatorX: r.left };
            }
        }
        const last = cells[cells.length - 1].getBoundingClientRect();
        return { beforeKey: null, indicatorX: last.right };
    }, [containerRef]);

    // Returned as onPointerDown for the header label. Curried by column.
    const beginPress = useCallback((colKey, label) => (e) => {
        // Left button only; ignore synthetic/keyboard.
        if (e.button !== undefined && e.button !== 0) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let active = false;
        let holdTimer = null;
        // Latest drop target, kept in the closure so pointerup never races the
        // last pointermove's React render.
        let latestBeforeKey = computeTarget(startX).beforeKey;

        const activate = () => {
            if (active) return;
            active = true;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "grabbing";
            setDragging({ key: colKey, label, pointerX: startX, pointerY: startY, ...computeTarget(startX) });
        };

        const onMove = (ev) => {
            if (!active) {
                if (Math.abs(ev.clientX - startX) > MOVE_THRESHOLD
                    || Math.abs(ev.clientY - startY) > MOVE_THRESHOLD) {
                    activate();
                } else {
                    return;
                }
            }
            const t = computeTarget(ev.clientX);
            latestBeforeKey = t.beforeKey;
            setDragging((s) => (s ? { ...s, pointerX: ev.clientX, pointerY: ev.clientY, ...t } : s));
        };

        const teardown = () => {
            if (holdTimer) clearTimeout(holdTimer);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("keydown", onKey);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };

        const finish = (commit) => {
            teardown();
            if (active) {
                // The browser fires a click after pointerup: swallow it so the
                // sort does not toggle right after a reorder.
                suppressClickRef.current.add(colKey);
                if (commit && latestBeforeKey !== colKey && typeof onReorder === "function") {
                    onReorder(colKey, latestBeforeKey);
                }
            }
            setDragging(null);
        };

        const onUp = () => finish(true);
        const onKey = (ev) => { if (ev.key === "Escape") finish(false); };

        holdTimer = setTimeout(activate, HOLD_DELAY_MS);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("keydown", onKey);
    }, [computeTarget, onReorder]);

    // Consumed by the header's sort button: returns true (once) when the click
    // must be ignored because it immediately follows a drag.
    const shouldSuppressClick = useCallback((colKey) => {
        if (suppressClickRef.current.has(colKey)) {
            suppressClickRef.current.delete(colKey);
            return true;
        }
        return false;
    }, []);

    return {
        dragging,
        draggingKey: dragging?.key ?? null,
        beginPress,
        shouldSuppressClick,
    };
};
