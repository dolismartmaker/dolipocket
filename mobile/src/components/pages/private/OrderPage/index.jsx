import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useOrderData } from "./useOrderData";
import { OrderPageMobile } from "./OrderPage.mobile";
import { OrderPageDesktop } from "./OrderPage.desktop";
import { OrdersWorkspace } from "../OrdersPage/OrdersPage.tablet";

// Viewport router for the order detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the document preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const OrderPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <OrdersWorkspace initialId={id} />;
    return <OrderDetailViews />;
};

const OrderDetailViews = () => {
    const data = useOrderData();
    const { isDesktop } = useViewport();
    return isDesktop
        ? <OrderPageDesktop {...data} />
        : <OrderPageMobile {...data} />;
};
