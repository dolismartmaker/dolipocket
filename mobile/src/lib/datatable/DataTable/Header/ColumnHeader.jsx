import { FaCaretUp, FaCaretDown } from "react-icons/fa6";

// One <th> in the table header.
// - Click on label = toggle sort (asc -> desc -> none) when sortable AND not in config mode.
// - Right-edge resize handle: 4px wide, mousedown initiates a drag.
// - Config mode (v2): the table headers stay sober -- visibility and order
//   are driven by the <ColumnConfigurator> panel above the table. We only
//   disable the sort click while the panel is open to avoid surprising
//   sort changes when the user is configuring columns.
//
// Sort indicator: Dolibarr-style. A single small caret is rendered ONLY when
// this column is the active sort column. No persistent up/down icon for
// inactive columns -- keeps the header clean.

const SortCaret = ({ active, order }) => {
    if (!active) return null;
    return order === "desc"
        ? <FaCaretDown className="text-primary text-[12px] shrink-0" />
        : <FaCaretUp className="text-primary text-[12px] shrink-0" />;
};

export const ColumnHeader = ({
    column,
    width,
    isSortable,
    sortActive,
    sortOrder,
    onSortClick,
    onResizeStart,
    onResizeAutoFit,
    isConfigMode,
    isFirstSticky,
    stickyLeft,
    reorder,
    onOpenMenu,
}) => {
    const stickyStyles = isFirstSticky
        ? {
            position: "sticky",
            left: stickyLeft,
            zIndex: 5,
            background: "var(--dpk-dt-header-bg, #f8fafc)",
        }
        : {};

    // Pointer-based reorder (press-and-move / long-press): active outside
    // config mode, never on the system rownum column. The label area is the
    // drag source; a quick click still toggles the sort (the hook suppresses
    // only the click that immediately follows a drag). The resize handle is a
    // sibling and stays independent.
    const dndEnabled = !isConfigMode && column.key !== "_rownum" && !!reorder;
    const isDragging = dndEnabled && reorder.draggingKey === column.key;

    // Right-click opens the column context menu (desktop). Available on the
    // whole header cell, even the rownum column (sort/hide are just disabled).
    const menuEnabled = !isConfigMode && typeof onOpenMenu === "function";

    const handleSortClick = () => {
        if (dndEnabled && reorder.shouldSuppressClick(column.key)) return;
        onSortClick();
    };

    return (
        <th
            scope="col"
            data-dt-col={column.key}
            className="relative text-left text-[12px] font-semibold text-gray-700 select-none"
            style={{
                width,
                minWidth: width,
                maxWidth: width,
                height: 32,
                padding: "0 8px",
                borderBottom: "1px solid #e5e7eb",
                background: "#f8fafc",
                ...stickyStyles,
            }}
            onContextMenu={menuEnabled ? (e) => { e.preventDefault(); onOpenMenu(column.key, e.clientX, e.clientY); } : undefined}
        >
            <div
                className={`flex items-center gap-1 h-full ${dndEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-40" : ""}`}
                onPointerDown={dndEnabled ? reorder.beginPress(column.key, column.label) : undefined}
                title={dndEnabled ? "Glisser pour déplacer - clic droit pour plus d'options" : undefined}
            >
                <button
                    type="button"
                    onClick={isSortable && !isConfigMode ? handleSortClick : undefined}
                    className={`flex-1 flex items-center gap-1 truncate text-left ${isSortable && !isConfigMode ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
                    aria-disabled={!isSortable || isConfigMode}
                    title={column.label}
                >
                    {isSortable && !isConfigMode && (
                        <SortCaret active={sortActive} order={sortOrder} />
                    )}
                    <span className="truncate">{column.label}</span>
                </button>
            </div>

            {!isConfigMode && (
                <span
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onResizeStart(column.key, e.clientX, width);
                    }}
                    onDoubleClick={() => onResizeAutoFit(column.key, column.label)}
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: 6,
                        height: "100%",
                        cursor: "col-resize",
                        userSelect: "none",
                    }}
                    title="Glisser pour redimensionner, double-clic pour ajuster"
                />
            )}
        </th>
    );
};
