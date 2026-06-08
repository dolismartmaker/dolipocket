import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useSupplierOrderData } from "./useSupplierOrderData";
import { SupplierOrderPageMobile } from "./SupplierOrderPage.mobile";
import { SupplierOrderPageDesktop } from "./SupplierOrderPage.desktop";
import { SupplierOrdersWorkspace } from "../SupplierOrdersPage/SupplierOrdersPage.tablet";

// Viewport router for the supplier order detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the document preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const SupplierOrderPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <SupplierOrdersWorkspace initialId={id} />;
    return <SupplierOrderDetailViews />;
};

const SupplierOrderDetailViews = () => {
    const data = useSupplierOrderData();
    const { isMobile } = useViewport();
    return isMobile
        ? <SupplierOrderPageMobile {...data} />
        : <SupplierOrderPageDesktop {...data} />;
};

export default SupplierOrderPage;
