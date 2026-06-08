import { useViewport } from "src/lib/viewport";

import { ThirdPartyEditPage as ThirdPartyEditPageMobile } from "./ThirdPartyEditPage.mobile";
import { ThirdPartyEditPageDesktop } from "./ThirdPartyEditPage.desktop";
import { ThirdPartyEditPageTablet } from "./ThirdPartyEditPage.tablet";
import { useThirdPartyEditData } from "./useThirdPartyEditData";

// Viewport router for the thirdparty edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop and tablet both consume useThirdPartyEditData()
// and render <AutoForm> (the tablet variant uses touch-sized chrome and a
// two-column form).
const DesktopWrapper = () => {
    const data = useThirdPartyEditData();
    return <ThirdPartyEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useThirdPartyEditData();
    return <ThirdPartyEditPageTablet {...data} />;
};

export const ThirdPartyEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <ThirdPartyEditPageMobile /> : <DesktopWrapper />;
};
