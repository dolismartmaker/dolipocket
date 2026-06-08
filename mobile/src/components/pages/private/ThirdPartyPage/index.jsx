import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useThirdPartyData } from "./useThirdPartyData";
import { ThirdPartyPageMobile } from "./ThirdPartyPage.mobile";
import { ThirdPartyPageDesktop } from "./ThirdPartyPage.desktop";
import { ThirdPartiesWorkspace } from "../ThirdPartiesPage/ThirdPartiesPage.tablet";

// Viewport router for the third party detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the record preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const ThirdPartyPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <ThirdPartiesWorkspace initialId={id} />;
    return <ThirdPartyDetailViews />;
};

const ThirdPartyDetailViews = () => {
    const data = useThirdPartyData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ThirdPartyPageMobile {...data} />
        : <ThirdPartyPageDesktop {...data} />;
};
