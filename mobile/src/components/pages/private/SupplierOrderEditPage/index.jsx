import { useViewport } from "src/lib/viewport";

import { SupplierOrderEditPage as SupplierOrderEditPageMobile } from "./SupplierOrderEditPage.mobile";
import { SupplierOrderEditPageDesktop } from "./SupplierOrderEditPage.desktop";
import { SupplierOrderEditPageTablet } from "./SupplierOrderEditPage.tablet";
import { useSupplierOrderEditData } from "./useSupplierOrderEditData";

// Viewport router for the supplier order edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation (with line accordions). Desktop and tablet both consume
// useSupplierOrderEditData() and render <AutoForm> + <DocumentLinesEditor>;
// the tablet variant uses a touch-sized chrome and a two-column form.
const DesktopWrapper = () => {
    const data = useSupplierOrderEditData();
    return <SupplierOrderEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useSupplierOrderEditData();
    return <SupplierOrderEditPageTablet {...data} />;
};

export const SupplierOrderEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <SupplierOrderEditPageMobile /> : <DesktopWrapper />;
};
