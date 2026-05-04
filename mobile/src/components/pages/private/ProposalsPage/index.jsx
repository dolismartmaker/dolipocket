import { useViewport } from "src/lib/viewport";

import { useProposalsData } from "./useProposalsData";
import { ProposalsPageMobile } from "./ProposalsPage.mobile";
import { ProposalsPageDesktop } from "./ProposalsPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useProposalsData(); .mobile and .desktop are pure render.
export const ProposalsPage = () => {
    const data = useProposalsData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <ProposalsPageDesktop {...data} />
        : <ProposalsPageMobile {...data} />;
};

export default ProposalsPage;
