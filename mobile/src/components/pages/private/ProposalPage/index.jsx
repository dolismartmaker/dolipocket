import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useProposalData } from "./useProposalData";
import { ProposalPageMobile } from "./ProposalPage.mobile";
import { ProposalPageDesktop } from "./ProposalPage.desktop";
import { ProposalsWorkspace } from "../ProposalsPage/ProposalsPage.tablet";

// Viewport router for the proposal detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the document preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const ProposalPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <ProposalsWorkspace initialId={id} />;
    return <ProposalDetailViews />;
};

const ProposalDetailViews = () => {
    const data = useProposalData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ProposalPageMobile {...data} />
        : <ProposalPageDesktop {...data} />;
};
