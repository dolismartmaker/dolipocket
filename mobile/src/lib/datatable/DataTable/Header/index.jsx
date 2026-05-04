import { ColumnHeader } from "./ColumnHeader";

// Header row.
//
// Layout (left -> right) :
//   sticky-left: select-all checkbox, then visible columns (incl. #),
//                first data column is also sticky-left.
//   middle:      remaining visible data columns (scroll horizontally).
//   sticky-right: actions column header (empty cell).

export const Header = ({
    columns,
    sort,
    onSortToggle,
    isConfigMode,
    resize,
    selection,
    hasActions,
    actionsWidth,
    stickyLeftOffsets,
    rowsForAutoFit,
}) => {
    return (
        <thead>
            <tr>
                <th
                    scope="col"
                    style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 6,
                        width: 36,
                        minWidth: 36,
                        maxWidth: 36,
                        height: 32,
                        background: "#f8fafc",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "0 6px",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={selection.allVisibleSelected}
                        ref={(el) => {
                            if (el) el.indeterminate = !selection.allVisibleSelected && selection.someVisibleSelected;
                        }}
                        onChange={selection.toggleAllVisible}
                        aria-label="Tout sélectionner sur la page"
                        className="cursor-pointer"
                    />
                </th>
                {columns.map((col) => {
                    if (col.visible === false) return null;
                    const isSortable = col.sortable !== false && col.key !== "_rownum";
                    const sortActive = sort?.col === col.key;
                    const stickyLeft = stickyLeftOffsets[col.key];
                    return (
                        <ColumnHeader
                            key={col.key}
                            column={col}
                            width={resize.previewWidth(col.key, col.width)}
                            isSortable={isSortable}
                            sortActive={sortActive}
                            sortOrder={sort?.order}
                            onSortClick={() => onSortToggle(col.key)}
                            onResizeStart={resize.startResize}
                            onResizeAutoFit={(k, label) => resize.autoFit(k, label, rowsForAutoFit ?? [])}
                            isConfigMode={isConfigMode}
                            isFirstSticky={typeof stickyLeft === "number"}
                            stickyLeft={stickyLeft}
                        />
                    );
                })}
                {hasActions && (
                    <th
                        scope="col"
                        style={{
                            position: "sticky",
                            right: 0,
                            zIndex: 6,
                            width: actionsWidth,
                            minWidth: actionsWidth,
                            maxWidth: actionsWidth,
                            height: 32,
                            background: "#f8fafc",
                            borderBottom: "1px solid #e5e7eb",
                            borderLeft: "1px solid #e5e7eb",
                            padding: "0 8px",
                            textAlign: "right",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#374151",
                        }}
                    />
                )}
            </tr>
        </thead>
    );
};
