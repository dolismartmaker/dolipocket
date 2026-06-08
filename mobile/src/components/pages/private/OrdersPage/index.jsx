import { useViewport } from "src/lib/viewport";

import { useOrdersData } from "./useOrdersData";
import { OrdersPageMobile } from "./OrdersPage.mobile";
import { OrdersPageDesktop } from "./OrdersPage.desktop";
import { OrdersWorkspace } from "./OrdersPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useOrdersData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const OrdersPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <OrdersWorkspace />;
    return <OrdersListViews />;
};

const OrdersListViews = () => {
    const data = useOrdersData();
    const { isMobile } = useViewport();
    return isMobile
        ? <OrdersPageMobile {...data} />
        : <OrdersPageDesktop {...data} />;
};

export default OrdersPage;
