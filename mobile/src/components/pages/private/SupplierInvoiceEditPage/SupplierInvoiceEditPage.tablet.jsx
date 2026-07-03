import { TabletEditScaffold } from "src/lib/tablet";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { SUPPLIER_INVOICE_CONFIG } from "src/lib/document/documentConfig";

// Tablet supplier invoice edit page: touch AutoForm + lines editor. Curated
// header whitelist from SUPPLIER_INVOICE_CONFIG.editFields.
export const SupplierInvoiceEditPageTablet = (props) => {
    const { isNew, invoice, setInvoice, loading, saving, error, initialValues, describe, save, cancel, dbSupplierInvoices } = props;
    const includeKeys = isNew ? SUPPLIER_INVOICE_CONFIG.editFields.create : SUPPLIER_INVOICE_CONFIG.editFields.update;
    return (
        <TabletEditScaffold
            title={isNew ? SUPPLIER_INVOICE_CONFIG.newTitle : `Modifier ${invoice?.ref ?? ""}`}
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
                    dataSource={dbSupplierInvoices}
                    onChange={(u) => { if (typeof setInvoice === "function" && u) setInvoice(u); }}
                />
            )}
        />
    );
};
