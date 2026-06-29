import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { SUPPLIER_ORDER_CONFIG } from "src/lib/document/documentConfig";

// Desktop supplier order detail page. Cockpit layout provided generically by
// <DocumentDetailShell>; supplier-order workflow (validate / approve / order /
// reception / invoice) lives in SUPPLIER_ORDER_CONFIG. No local modal state:
// the send-by-email modal is driven entirely from useSupplierOrderData.
export const SupplierOrderPageDesktop = (props) => (
    <DocumentDetailShell config={SUPPLIER_ORDER_CONFIG} data={props} />
);
