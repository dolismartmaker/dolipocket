import { useViewport } from "src/lib/viewport";

import { useWarehousesData } from "./useWarehousesData";
import { WarehousesPageMobile } from "./WarehousesPage.mobile";
import { WarehousesPageDesktop } from "./WarehousesPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useWarehousesData(); .mobile and .desktop are pure render.
export const WarehousesPage = () => {
    const data = useWarehousesData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <WarehousesPageDesktop {...data} />
        : <WarehousesPageMobile {...data} />;
};

export default WarehousesPage;
