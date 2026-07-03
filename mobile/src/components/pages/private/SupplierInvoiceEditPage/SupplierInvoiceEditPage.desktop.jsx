import { DocumentEditShell } from "src/lib/document/DocumentEditShell";
import { SUPPLIER_INVOICE_CONFIG } from "src/lib/document/documentConfig";

// Desktop supplier invoice edit page: thin wrapper over <DocumentEditShell>.
export const SupplierInvoiceEditPageDesktop = (props) => (
    <DocumentEditShell
        config={SUPPLIER_INVOICE_CONFIG}
        isNew={props.isNew}
        loading={props.loading}
        saving={props.saving}
        error={props.error}
        initialValues={props.initialValues}
        describe={props.describe}
        save={props.save}
        cancel={props.cancel}
        object={props.invoice}
        setObject={props.setInvoice}
        dataSource={props.dbSupplierInvoices}
    />
);
