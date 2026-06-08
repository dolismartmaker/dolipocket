import { useViewport } from "src/lib/viewport";

import { OrderEditPage as OrderEditPageMobile } from "./OrderEditPage.mobile";
import { OrderEditPageDesktop } from "./OrderEditPage.desktop";
import { OrderEditPageTablet } from "./OrderEditPage.tablet";
import { useOrderEditData } from "./useOrderEditData";

// Viewport router for the order edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation (with line accordions). Desktop and tablet both consume
// useOrderEditData() and render <AutoForm>; the tablet variant uses a
// touch-sized chrome (TabletEditScaffold) and exposes the lines editor.
const DesktopWrapper = () => {
    const data = useOrderEditData();
    return <OrderEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useOrderEditData();
    return <OrderEditPageTablet {...data} />;
};

export const OrderEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <OrderEditPageMobile /> : <DesktopWrapper />;
};
