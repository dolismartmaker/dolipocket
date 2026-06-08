import { useViewport } from "src/lib/viewport";

import { ProposalEditPage as ProposalEditPageMobile } from "./ProposalEditPage.mobile";
import { ProposalEditPageDesktop } from "./ProposalEditPage.desktop";
import { ProposalEditPageTablet } from "./ProposalEditPage.tablet";
import { useProposalEditData } from "./useProposalEditData";

// Viewport router for the proposal edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop and tablet both consume useProposalEditData() and
// render <AutoForm> + <DocumentLinesEditor>; the tablet variant uses a
// touch-sized chrome and a two-column form.
const DesktopWrapper = () => {
    const data = useProposalEditData();
    return <ProposalEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useProposalEditData();
    return <ProposalEditPageTablet {...data} />;
};

export const ProposalEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <ProposalEditPageMobile /> : <DesktopWrapper />;
};
