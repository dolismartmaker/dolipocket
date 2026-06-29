import { useState } from "react";

import { DocumentDetailShell } from "src/lib/document/DocumentDetailShell";
import { PROPOSAL_CONFIG } from "src/lib/document/documentConfig";

// Desktop proposal (devis) detail page. The whole cockpit layout is provided
// generically by <DocumentDetailShell>; everything proposal-specific lives in
// PROPOSAL_CONFIG. The only local state is the deposit-invoice modal flag,
// merged into the data bag so the config's renderModals() can drive it without
// touching useProposalData (shared with mobile/tablet).
export const ProposalPageDesktop = (props) => {
    const [depositOpen, setDepositOpen] = useState(false);
    return (
        <DocumentDetailShell
            config={PROPOSAL_CONFIG}
            data={{ ...props, depositOpen, setDepositOpen }}
        />
    );
};
