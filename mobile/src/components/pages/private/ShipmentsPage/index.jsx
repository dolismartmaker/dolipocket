import { useViewport } from "src/lib/viewport";

import { useShipmentsData } from "./useShipmentsData";
import { ShipmentsPageMobile } from "./ShipmentsPage.mobile";
import { ShipmentsPageDesktop } from "./ShipmentsPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useShipmentsData(); .mobile and .desktop are pure render.
// Shipments are a desktop-first feature; tablet falls back to the desktop view.
export const ShipmentsPage = () => {
    const data = useShipmentsData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ShipmentsPageMobile {...data} />
        : <ShipmentsPageDesktop {...data} />;
};

export default ShipmentsPage;
