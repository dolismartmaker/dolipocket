import { useViewport } from "src/lib/viewport";

import { ContactEditPage as ContactEditPageMobile } from "./ContactEditPage.mobile";
import { ContactEditPageDesktop } from "./ContactEditPage.desktop";
import { ContactEditPageTablet } from "./ContactEditPage.tablet";
import { useContactEditData } from "./useContactEditData";

// Viewport router for the contact edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop and tablet both consume useContactEditData()
// and render <AutoForm> (the tablet variant uses touch-sized chrome and a
// two-column form).
const DesktopWrapper = () => {
    const data = useContactEditData();
    return <ContactEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useContactEditData();
    return <ContactEditPageTablet {...data} />;
};

export const ContactEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <ContactEditPageMobile /> : <DesktopWrapper />;
};
