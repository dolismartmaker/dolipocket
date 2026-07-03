import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { ORDER_CONFIG } from "src/lib/document/documentConfig";

// Tablet order edit page: touch AutoForm + lines editor. Curated header
// whitelist from ORDER_CONFIG.editFields.
export const OrderEditPageTablet = (props) => {
    const { isNew, order, setOrder, loading, saving, error, initialValues, describe, save, cancel, dbOrders } = props;
    const includeKeys = isNew ? ORDER_CONFIG.editFields.create : ORDER_CONFIG.editFields.update;
    return (
        <TabletEditScaffold
            title={isNew ? ORDER_CONFIG.newTitle : `Modifier ${order?.ref ?? ""}`}
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
                    dataSource={dbOrders}
                    onChange={(u) => { if (typeof setOrder === "function" && u) setOrder(u); }}
                />
            )}
        />
    );
};
