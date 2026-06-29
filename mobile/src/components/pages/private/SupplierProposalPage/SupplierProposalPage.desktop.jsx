import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { SUPPLIER_PROPOSAL_CONFIG } from "src/lib/document/documentConfig";

// Desktop supplier price request detail page. Cockpit layout provided
// generically by <DocumentDetailShell>; the request workflow (validate / sign /
// unsign / reopen) lives in SUPPLIER_PROPOSAL_CONFIG. No PDF/email/payment for
// this document, hence no modals.
export const SupplierProposalPageDesktop = (props) => (
    <DocumentDetailShell config={SUPPLIER_PROPOSAL_CONFIG} data={props} />
);
