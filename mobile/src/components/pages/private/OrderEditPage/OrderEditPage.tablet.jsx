import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for an Order: focused full-page touch form (AutoForm in
// two columns) + the document lines editor (touch cards variant on tablet).
// Reuses useOrderEditData() and mirrors the desktop excludeKeys.
const EXCLUDE_KEYS = [
    "ref",
    "totalHt",
    "totalTva",
    "totalTtc",
    "fkStatut",
    "status",
    "statut",
    "datec",
    "dateValid",
    "datev",
    "dateCloture",
    "lastMainDoc",
    "modelPdf",
    "facturee",
    "fkUserAuthor",
    "fkUserValid",
    "fkUserCloture",
    "fkUserModif",
];

export const OrderEditPageTablet = ({
    isNew,
    order,
    setOrder,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
    dbOrders,
}) => {
    return (
        <TabletEditScaffold
            title={isNew ? "Nouvelle commande" : `Modifier ${order?.ref ?? ""}`}
            loading={loading}
            saving={saving}
            error={error}
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            excludeKeys={EXCLUDE_KEYS}
            onCancel={cancel}
            onSave={save}
            renderLines={() => (
                <DocumentLinesEditor
                    docId={!isNew && order ? Number(order.id) : 0}
                    lines={order?.lines ?? []}
                    dataSource={dbOrders}
                    onChange={(updatedDoc) => {
                        if (typeof setOrder === "function" && updatedDoc) setOrder(updatedDoc);
                    }}
                />
            )}
        />
    );
};
