import { useState } from "react";

import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { INVOICE_CONFIG } from "src/lib/document/documentConfig";

// Desktop invoice detail page. The whole layout (command bar with contextual
// CTA + overflow menu, summary band, commercial flow ribbon, full-width
// editable lines + sticky tabbed inspector) is provided generically by
// <DocumentDetailShell>; everything invoice-specific lives in INVOICE_CONFIG.
//
// The only local state is the recurring-template modal open flag, which is
// merged into the data bag so the config's renderModals() can drive it without
// touching useInvoiceData (kept untouched, shared with mobile/tablet).
export const InvoicePageDesktop = (props) => {
    const [recurringOpen, setRecurringOpen] = useState(false);
    return (
        <DocumentDetailShell
            config={INVOICE_CONFIG}
            data={{ ...props, recurringOpen, setRecurringOpen }}
        />
    );
};
