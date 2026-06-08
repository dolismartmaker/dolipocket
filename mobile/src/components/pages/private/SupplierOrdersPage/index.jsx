import { useViewport } from "src/lib/viewport";

import { useSupplierOrdersData } from "./useSupplierOrdersData";
import { SupplierOrdersPageMobile } from "./SupplierOrdersPage.mobile";
import { SupplierOrdersPageDesktop } from "./SupplierOrdersPage.desktop";
import { SupplierOrdersWorkspace } from "./SupplierOrdersPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useSupplierOrdersData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const SupplierOrdersPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <SupplierOrdersWorkspace />;
    return <SupplierOrdersListViews />;
};

const SupplierOrdersListViews = () => {
    const data = useSupplierOrdersData();
    const { isMobile } = useViewport();
    return isMobile
        ? <SupplierOrdersPageMobile {...data} />
        : <SupplierOrdersPageDesktop {...data} />;
};

export default SupplierOrdersPage;
