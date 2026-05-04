import { useViewport } from "src/lib/viewport";

import { useSupplierInvoicesData } from "./useSupplierInvoicesData";
import { SupplierInvoicesPageMobile } from "./SupplierInvoicesPage.mobile";
import { SupplierInvoicesPageDesktop } from "./SupplierInvoicesPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useSupplierInvoicesData(); .mobile and .desktop are pure render.
export const SupplierInvoicesPage = () => {
    const data = useSupplierInvoicesData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <SupplierInvoicesPageDesktop {...data} />
        : <SupplierInvoicesPageMobile {...data} />;
};

export default SupplierInvoicesPage;
