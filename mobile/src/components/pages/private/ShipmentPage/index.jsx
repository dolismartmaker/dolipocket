import { useViewport } from "src/lib/viewport";

import { useShipmentData } from "./useShipmentData";
import { ShipmentPageMobile } from "./ShipmentPage.mobile";
import { ShipmentPageDesktop } from "./ShipmentPage.desktop";

// Viewport router for the shipment detail page. Data + handlers live in
// useShipmentData(); the .mobile / .desktop files are pure render. Shipments
// are desktop-first; tablet falls back to the desktop view.
export const ShipmentPage = () => {
    const data = useShipmentData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ShipmentPageMobile {...data} />
        : <ShipmentPageDesktop {...data} />;
};

export default ShipmentPage;
