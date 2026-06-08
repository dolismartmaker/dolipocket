import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for an Invoice: focused full-page touch form (AutoForm in
// two columns) + the document lines editor (touch cards variant on tablet).
// Reuses useInvoiceEditData() and mirrors the desktop excludeKeys.
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
    "paye",
    "paid",
    "payed",
    "closeCode",
    "closeNote",
    "fkUserAuthor",
    "fkUserValid",
    "fkUserCloture",
    "fkUserModif",
];

export const InvoiceEditPageTablet = ({
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
    dbInvoices,
}) => {
    return (
        <TabletEditScaffold
            title={isNew ? "Nouvelle facture" : `Modifier ${invoice?.ref ?? ""}`}
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
                    dataSource={dbInvoices}
                    onChange={(updatedDoc) => {
                        if (typeof setInvoice === "function" && updatedDoc) setInvoice(updatedDoc);
                    }}
                />
            )}
        />
    );
};
