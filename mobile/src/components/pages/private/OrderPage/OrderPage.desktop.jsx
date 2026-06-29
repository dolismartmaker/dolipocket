import { useState } from "react";

import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { ORDER_CONFIG } from "src/lib/document/documentConfig";

// Desktop order (commande client) detail page. Cockpit layout provided
// generically by <DocumentDetailShell>; order-specific behaviour lives in
// ORDER_CONFIG. The deposit-invoice modal flag is local state merged into the
// data bag (useOrderData stays untouched, shared with mobile/tablet).
export const OrderPageDesktop = (props) => {
    const [depositOpen, setDepositOpen] = useState(false);
    return (
        <DocumentDetailShell
            config={ORDER_CONFIG}
            data={{ ...props, depositOpen, setDepositOpen }}
        />
    );
};
