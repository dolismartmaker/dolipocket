import { DocumentEditShell } from "src/lib/document/DocumentEditShell";
import { INVOICE_CONFIG } from "src/lib/document/documentConfig";

// Desktop invoice edit page: thin wrapper over the generic <DocumentEditShell>.
// Field curation (writable whitelist) + 2/3-lines / 1/3-header layout come from
// INVOICE_CONFIG.editFields and the shell.
export const InvoiceEditPageDesktop = (props) => (
    <DocumentEditShell
        config={INVOICE_CONFIG}
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
        dataSource={props.dbInvoices}
    />
);
