import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Tablet edit page for an Invoice: focused full-page touch form (AutoForm) +
// the document lines editor (touch cards variant on tablet). Reuses
// useInvoiceEditData() and the same curated header field whitelist as the
// desktop page, aligned with dmInvoice::$writableFields (no internal Dolibarr
// fields leaking into the user form).
const HEADER_KEYS_CREATE = [
    "fk_soc", "ref_client", "datef", "fk_cond_reglement", "fk_mode_reglement",
    "note_public", "note_private",
];
const HEADER_KEYS_UPDATE = [
    "ref_client", "datef", "date_lim_reglement", "fk_cond_reglement", "fk_mode_reglement",
    "note_public", "note_private",
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
    const includeKeys = isNew ? HEADER_KEYS_CREATE : HEADER_KEYS_UPDATE;
    return (
        <TabletEditScaffold
            title={isNew ? "Nouvelle facture" : `Modifier ${invoice?.ref ?? ""}`}
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
