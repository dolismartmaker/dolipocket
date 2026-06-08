import { useViewport } from "src/lib/viewport";

import { useThirdPartiesData } from "./useThirdPartiesData";
import { ThirdPartiesPageMobile } from "./ThirdPartiesPage.mobile";
import { ThirdPartiesPageDesktop } from "./ThirdPartiesPage.desktop";
import { ThirdPartiesWorkspace } from "./ThirdPartiesPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useThirdPartiesData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
//
// The viewport is frozen for the session, so branching the whole subtree (and
// therefore which data hooks run) is safe: the same branch is taken on every
// render until a reload.
export const ThirdPartiesPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <ThirdPartiesWorkspace />;
    return <ThirdPartiesListViews />;
};

const ThirdPartiesListViews = () => {
    const data = useThirdPartiesData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ThirdPartiesPageMobile {...data} />
        : <ThirdPartiesPageDesktop {...data} />;
};
