import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for a Supplier Invoice: focused full-page touch form
// (AutoForm in two columns) + the document lines editor (touch cards variant
// on tablet). Reuses useSupplierInvoiceEditData() and mirrors the desktop
// excludeKeys.
const EXCLUDE_KEYS = [
    // Computed / read-only header fields
    "ref",
    "totalHt",
    "totalTva",
    "totalTtc",
    "amount",
    "remise",
    "fkStatut",
    "status",
    "statut",
    "datec",
    "dateValid",
    "datev",
    "dateCloture",
    "lastMainDoc",
    "modelPdf",
    "paye",
    "paid",
    "payed",
    "closeCode",
    "closeNote",
    // Author / valid / modifier are auto-resolved by Dolibarr
    "fkUserAuthor",
    "fkUserValid",
    "fkUserCloture",
    "fkUserModif",
];

export const SupplierInvoiceEditPageTablet = ({
    isNew,
    invoice,
    setInvoice,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
    dbSupplierInvoices,
}) => {
    return (
        <TabletEditScaffold
            title={isNew ? "Nouvelle facture fournisseur" : `Modifier ${invoice?.ref ?? ""}`}
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
                    docId={!isNew && invoice ? Number(invoice.id) : 0}
                    lines={invoice?.lines ?? []}
                    dataSource={dbSupplierInvoices}
                    onChange={(updatedDoc) => {
                        if (typeof setInvoice === "function" && updatedDoc) setInvoice(updatedDoc);
                    }}
                />
            )}
        />
    );
};
