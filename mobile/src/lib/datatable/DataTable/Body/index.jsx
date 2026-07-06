import { Row } from "./Row";

export const Body = ({
    rows,
    columns,
    page,
    pageSize,
    rowKey,
    selection,
    rowActions,
    rowKebabActions,
    onRowClick,
    actionsWidth,
    stickyLeftOffsets,
    ctx,
    loading,
    error,
    onRetry,
}) => {
    // checkbox + visible columns + filler + optional actions column.
    const visibleColCount = 2
        + columns.filter((c) => c.visible !== false).length
        + ((rowActions?.length || rowKebabActions?.length) ? 1 : 0);

    if (error) {
        return (
            <tbody>
                <tr>
                    <td colSpan={visibleColCount} style={{ padding: 16 }}>
                        <div className="flex items-center gap-2 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                            <span>Erreur de chargement.</span>
                            <button
                                type="button"
                                onClick={onRetry}
                                className="px-2 py-0.5 text-[12px] bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Réessayer
                            </button>
                        </div>
                    </td>
                </tr>
            </tbody>
        );
    }

    if (loading && (!rows || rows.length === 0)) {
        return (
            <tbody>
                <tr>
                    <td colSpan={visibleColCount} style={{ padding: 16 }}>
                        <div className="text-center text-[13px] text-gray-500">Chargement...</div>
                    </td>
                </tr>
            </tbody>
        );
    }

    if (!rows || rows.length === 0) {
        return (
            <tbody>
                <tr>
                    <td colSpan={visibleColCount} style={{ padding: 16 }}>
                        <div className="text-center text-[13px] text-gray-500">Aucun résultat</div>
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <tbody>
            {rows.map((row, idx) => {
                const k = rowKey(row);
                return (
                    <Row
                        key={k}
                        row={row}
                        rowIndexInPage={idx}
                        page={page}
                        pageSize={pageSize}
                        columns={columns}
                        rowKey={rowKey}
                        selected={selection.isSelected(row)}
                        selectionActive={selection.count > 0}
                        onToggleSelect={selection.toggle}
                        rowActions={rowActions}
                        rowKebabActions={rowKebabActions}
                        onRowClick={onRowClick}
                        actionsWidth={actionsWidth}
                        stickyLeftOffsets={stickyLeftOffsets}
                        ctx={ctx}
                    />
                );
            })}
        </tbody>
    );
};
