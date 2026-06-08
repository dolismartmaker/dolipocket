import { useViewport } from "src/lib/viewport";

import { ProductEditPage as ProductEditPageMobile } from "./ProductEditPage.mobile";
import { ProductEditPageDesktop } from "./ProductEditPage.desktop";
import { ProductEditPageTablet } from "./ProductEditPage.tablet";
import { useProductEditData } from "./useProductEditData";

// Viewport router for the product edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop and tablet both consume useProductEditData() and
// render <AutoForm> (the tablet variant uses touch-sized chrome and a
// two-column form).
const DesktopWrapper = () => {
    const data = useProductEditData();
    return <ProductEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useProductEditData();
    return <ProductEditPageTablet {...data} />;
};

export const ProductEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <ProductEditPageMobile /> : <DesktopWrapper />;
};
