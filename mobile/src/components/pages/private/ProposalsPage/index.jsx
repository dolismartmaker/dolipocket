import { useViewport } from "src/lib/viewport";

import { useProposalsData } from "./useProposalsData";
import { ProposalsPageMobile } from "./ProposalsPage.mobile";
import { ProposalsPageDesktop } from "./ProposalsPage.desktop";
import { ProposalsWorkspace } from "./ProposalsPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useProposalsData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const ProposalsPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <ProposalsWorkspace />;
    return <ProposalsListViews />;
};

const ProposalsListViews = () => {
    const data = useProposalsData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ProposalsPageMobile {...data} />
        : <ProposalsPageDesktop {...data} />;
};

export default ProposalsPage;
