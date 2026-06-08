import { useViewport } from "src/lib/viewport";

import { WarehouseEditPage as WarehouseEditPageMobile } from "./WarehouseEditPage.mobile";
import { WarehouseEditPageDesktop } from "./WarehouseEditPage.desktop";
import { WarehouseEditPageTablet } from "./WarehouseEditPage.tablet";
import { useWarehouseEditData } from "./useWarehouseEditData";

// Viewport router for the warehouse edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop and tablet both consume useWarehouseEditData()
// and render <AutoForm> (the tablet variant uses touch-sized chrome and a
// two-column form).
const DesktopWrapper = () => {
    const data = useWarehouseEditData();
    return <WarehouseEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useWarehouseEditData();
    return <WarehouseEditPageTablet {...data} />;
};

export const WarehouseEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <WarehouseEditPageMobile /> : <DesktopWrapper />;
};
