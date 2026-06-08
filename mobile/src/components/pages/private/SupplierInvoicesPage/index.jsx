import { useViewport } from "src/lib/viewport";

import { useSupplierInvoicesData } from "./useSupplierInvoicesData";
import { SupplierInvoicesPageMobile } from "./SupplierInvoicesPage.mobile";
import { SupplierInvoicesPageDesktop } from "./SupplierInvoicesPage.desktop";
import { SupplierInvoicesWorkspace } from "./SupplierInvoicesPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useSupplierInvoicesData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const SupplierInvoicesPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <SupplierInvoicesWorkspace />;
    return <SupplierInvoicesListViews />;
};

const SupplierInvoicesListViews = () => {
    const data = useSupplierInvoicesData();
    const { isMobile } = useViewport();
    return isMobile
        ? <SupplierInvoicesPageMobile {...data} />
        : <SupplierInvoicesPageDesktop {...data} />;
};

export default SupplierInvoicesPage;
