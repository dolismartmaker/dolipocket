import { useViewport } from "src/lib/viewport";

import { useSupplierOrdersData } from "./useSupplierOrdersData";
import { SupplierOrdersPageMobile } from "./SupplierOrdersPage.mobile";
import { SupplierOrdersPageDesktop } from "./SupplierOrdersPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useSupplierOrdersData(); .mobile and .desktop are pure render.
export const SupplierOrdersPage = () => {
    const data = useSupplierOrdersData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <SupplierOrdersPageDesktop {...data} />
        : <SupplierOrdersPageMobile {...data} />;
};

export default SupplierOrdersPage;
