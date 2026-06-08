import { useViewport } from "src/lib/viewport";

import { useInvoicesData } from "./useInvoicesData";
import { InvoicesPageMobile } from "./InvoicesPage.mobile";
import { InvoicesPageDesktop } from "./InvoicesPage.desktop";
import { InvoicesWorkspace } from "./InvoicesPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useInvoicesData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const InvoicesPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <InvoicesWorkspace />;
    return <InvoicesListViews />;
};

const InvoicesListViews = () => {
    const data = useInvoicesData();
    const { isMobile } = useViewport();
    return isMobile
        ? <InvoicesPageMobile {...data} />
        : <InvoicesPageDesktop {...data} />;
};

export default InvoicesPage;
