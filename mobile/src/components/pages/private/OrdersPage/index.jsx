import { useViewport } from "src/lib/viewport";

import { useOrdersData } from "./useOrdersData";
import { OrdersPageMobile } from "./OrdersPage.mobile";
import { OrdersPageDesktop } from "./OrdersPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useOrdersData(); .mobile and .desktop are pure render.
export const OrdersPage = () => {
    const data = useOrdersData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <OrdersPageDesktop {...data} />
        : <OrdersPageMobile {...data} />;
};

export default OrdersPage;
