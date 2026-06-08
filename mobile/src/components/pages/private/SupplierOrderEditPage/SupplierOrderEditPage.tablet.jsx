import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for a Supplier Order: focused full-page touch form (AutoForm
// in two columns) + the document lines editor (touch cards variant on tablet).
// Reuses useSupplierOrderEditData() and mirrors the desktop excludeKeys.
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
    "dateApprove",
    "dateApprove2",
    "dateCloture",
    "dateCommande",
    "lastMainDoc",
    "modelPdf",
    "billed",
    "fkUserAuthor",
    "fkUserValid",
    "fkUserApprove",
    "fkUserApprove2",
    "fkUserCloture",
    "fkUserModif",
];

export const SupplierOrderEditPageTablet = ({
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
    dbSupplierOrders,
}) => {
    return (
        <TabletEditScaffold
            title={isNew ? "Nouvelle commande fournisseur" : `Modifier ${order?.ref ?? ""}`}
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
                    dataSource={dbSupplierOrders}
                    onChange={(updatedDoc) => {
                        if (typeof setOrder === "function" && updatedDoc) setOrder(updatedDoc);
                    }}
                />
            )}
        />
    );
};
