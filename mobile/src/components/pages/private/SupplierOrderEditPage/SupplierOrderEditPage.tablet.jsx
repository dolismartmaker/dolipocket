import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { SUPPLIER_ORDER_CONFIG } from "src/lib/document/documentConfig";

// Tablet supplier order edit page: touch AutoForm + lines editor. Curated
// header whitelist from SUPPLIER_ORDER_CONFIG.editFields.
export const SupplierOrderEditPageTablet = (props) => {
    const { isNew, order, setOrder, loading, saving, error, initialValues, describe, save, cancel, dbSupplierOrders } = props;
    const includeKeys = isNew ? SUPPLIER_ORDER_CONFIG.editFields.create : SUPPLIER_ORDER_CONFIG.editFields.update;
    return (
        <TabletEditScaffold
            title={isNew ? SUPPLIER_ORDER_CONFIG.newTitle : `Modifier ${order?.ref ?? ""}`}
            loading={loading}
            saving={saving}
            error={error}
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            includeKeys={includeKeys}
            groupings={[{ id: "main", title: "En-tête", keys: includeKeys }]}
            onCancel={cancel}
            onSave={save}
            renderLines={() => (
                <DocumentLinesEditor
                    docId={!isNew && order ? Number(order.id) : 0}
                    lines={order?.lines ?? []}
                    dataSource={dbSupplierOrders}
                    onChange={(u) => { if (typeof setOrder === "function" && u) setOrder(u); }}
                />
            )}
        />
    );
};
