import { useRef } from "react";
import {
    FaGripVertical,
    FaEyeSlash,
    FaChevronUp,
    FaChevronDown,
    FaLeftRight,
} from "react-icons/fa6";

import { LIST_LIMIT_OPTIONS, listLimitLabel } from "./layoutRegistry";

// Uniform wrapper around ANY cockpit box (whether it renders its own <section>
// like the Coordinates / Categories / Bank blocks, or via CockpitCard like the
// list cards). It owns:
//   - the grid-cell width (normal -> 1 cell, full -> col-span-full)
//   - the long-press gesture that enters edit mode (non-edit only)
//   - the edit chrome bar (drag handle, length, width, collapse, hide)
//   - the collapsed stub (title-only, expandable outside edit mode too)
//
// In edit mode the box content is made inert (pointer-events-none) so the whole
// tile reads as a movable object; all controls live in the chrome bar. This
// keeps CockpitCard and the self-rendering sections untouched.
//
// Conventions UI desktop épurées: the edit affordances use the amber accent
// already used by the DataTable ColumnConfigurator; no shadow on the tile.

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

const ChromeButton = ({ onClick, title, active = false, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={`p-1 rounded transition-colors ${
            active
                ? "bg-amber-200 text-amber-900"
                : "text-amber-800 hover:bg-amber-200/70"
        }`}
    >
        {children}
    </button>
);

const EditChromeBar = ({ box, width, collapsed, onToggleWidth, onToggleCollapsed, onHide, onSetLimit }) => (
    <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border-b border-amber-200 text-amber-900 select-none">
        <span className="text-amber-500 cursor-grab active:cursor-grabbing" title="Glisser pour déplacer" aria-hidden="true">
            <FaGripVertical className="text-[12px]" />
        </span>
        <span className="text-[12px] font-medium truncate">{box.label}</span>
        <span className="flex-1" />

        {box.kind === "list" && (
            <select
                value={String(box.limit ?? box.defaultLimit ?? 5)}
                onChange={(e) => onSetLimit(box.id, e.target.value === "all" ? "all" : Number(e.target.value))}
                className="h-[24px] px-1 rounded border border-amber-300 bg-white text-[11px] text-amber-900"
                title="Nombre de lignes affichées"
                aria-label={`Nombre de lignes pour ${box.label}`}
            >
                {LIST_LIMIT_OPTIONS.map((opt) => (
                    <option key={String(opt)} value={String(opt)}>
                        {listLimitLabel(opt)}
                    </option>
                ))}
            </select>
        )}

        <ChromeButton onClick={() => onToggleWidth(box.id)} title={width === "full" ? "Largeur normale" : "Pleine largeur"} active={width === "full"}>
            <FaLeftRight className="text-[12px]" />
        </ChromeButton>
        <ChromeButton onClick={() => onToggleCollapsed(box.id)} title={collapsed ? "Déplier" : "Replier"} active={collapsed}>
            {collapsed ? <FaChevronDown className="text-[12px]" /> : <FaChevronUp className="text-[12px]" />}
        </ChromeButton>
        <ChromeButton onClick={() => onHide(box.id)} title="Masquer cette boîte">
            <FaEyeSlash className="text-[12px]" />
        </ChromeButton>
    </div>
);

// Slim clickable header shown when a box is collapsed OUTSIDE edit mode, so the
// user can expand it back with a single click without re-entering edit mode.
const CollapsedStub = ({ box, onExpand, longPress }) => (
    <section
        className="bg-white rounded-xl border border-soft-border"
        {...longPress}
    >
        <button
            type="button"
            onClick={onExpand}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-medium-bg/50 transition-colors rounded-xl"
            title="Déplier"
        >
            <FaChevronDown className="text-soft-text text-xs shrink-0" />
            <span className="text-sm font-semibold text-strong-text truncate">{box.label}</span>
        </button>
    </section>
);

export const BoxChrome = ({
    box,
    editMode,
    drag,
    onLongPress,
    onToggleWidth,
    onToggleCollapsed,
    onHide,
    onSetLimit,
    onExpand,
    children,
}) => {
    const width = box.width || "normal";
    const collapsed = box.collapsed === true;
    // Masonry item classes: mb-4 gives the vertical rhythm (column-gap only
    // spaces columns horizontally), break-inside-avoid keeps a box whole, and a
    // "full" box spans every column (column-span:all).
    const spanClass = width === "full" ? "[column-span:all]" : "";
    const itemClass = `${spanClass} mb-4 break-inside-avoid`;
    const testId = `cockpit-box-${box.id}`;

    // --- long-press to enter edit mode (non-edit only) -----------------------
    const timerRef = useRef(null);
    const firedRef = useRef(false);
    const startRef = useRef({ x: 0, y: 0 });

    const clearTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const longPress = editMode
        ? {}
        : {
              onPointerDown: (e) => {
                  if (e.button !== undefined && e.button !== 0) return;
                  firedRef.current = false;
                  startRef.current = { x: e.clientX, y: e.clientY };
                  clearTimer();
                  timerRef.current = setTimeout(() => {
                      firedRef.current = true;
                      onLongPress?.();
                  }, LONG_PRESS_MS);
              },
              onPointerMove: (e) => {
                  if (!timerRef.current) return;
                  const dx = Math.abs(e.clientX - startRef.current.x);
                  const dy = Math.abs(e.clientY - startRef.current.y);
                  if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearTimer();
              },
              onPointerUp: clearTimer,
              onPointerLeave: clearTimer,
              // Runs before any child click: if the long press just fired,
              // swallow the click so a long press on a list row does not also
              // navigate away.
              onClickCapture: (e) => {
                  if (firedRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      firedRef.current = false;
                  }
              },
          };

    if (!editMode) {
        if (collapsed) {
            return (
                <div className={itemClass} data-testid={testId} data-collapsed="true">
                    <CollapsedStub box={box} onExpand={() => onExpand?.(box.id)} longPress={longPress} />
                </div>
            );
        }
        return (
            <div className={itemClass} data-testid={testId} {...longPress}>
                {children}
            </div>
        );
    }

    // --- edit mode: draggable tile with chrome bar + inert content -----------
    const ring = drag?.isHover
        ? "ring-2 ring-primary ring-offset-1"
        : "ring-2 ring-amber-300 ring-offset-1";

    return (
        <div
            className={`${itemClass} rounded-xl ${ring} overflow-hidden bg-white`}
            data-testid={testId}
            data-edit="true"
            draggable={!!drag}
            onDragStart={drag?.onDragStart}
            onDragEnd={drag?.onDragEnd}
            onDragOver={drag?.onDragOver}
            onDrop={drag?.onDrop}
        >
            <EditChromeBar
                box={box}
                width={width}
                collapsed={collapsed}
                onToggleWidth={onToggleWidth}
                onToggleCollapsed={onToggleCollapsed}
                onHide={onHide}
                onSetLimit={onSetLimit}
            />
            {!collapsed && <div className="pointer-events-none">{children}</div>}
        </div>
    );
};
