import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { SUPPLIER_INVOICE_CONFIG } from "src/lib/document/documentConfig";

// Desktop supplier invoice detail page. Cockpit layout provided generically by
// <DocumentDetailShell>; supplier-invoice behaviour (validate / pay / status
// transitions) lives in SUPPLIER_INVOICE_CONFIG. The send-by-email and payment
// modals are driven from useSupplierInvoiceData (already exposes the state).
export const SupplierInvoicePageDesktop = (props) => (
    <DocumentDetailShell config={SUPPLIER_INVOICE_CONFIG} data={props} />
);
