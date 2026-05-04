import { useViewport } from "src/lib/viewport";

import { useInvoicesData } from "./useInvoicesData";
import { InvoicesPageMobile } from "./InvoicesPage.mobile";
import { InvoicesPageDesktop } from "./InvoicesPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useInvoicesData(); .mobile and .desktop are pure render.
export const InvoicesPage = () => {
    const data = useInvoicesData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <InvoicesPageDesktop {...data} />
        : <InvoicesPageMobile {...data} />;
};

export default InvoicesPage;
