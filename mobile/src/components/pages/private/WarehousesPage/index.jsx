import { useViewport } from "src/lib/viewport";

import { useWarehousesData } from "./useWarehousesData";
import { WarehousesPageMobile } from "./WarehousesPage.mobile";
import { WarehousesPageDesktop } from "./WarehousesPage.desktop";
import { WarehousesWorkspace } from "./WarehousesPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useWarehousesData(); .mobile and .desktop are pure render.
// Tablet renders a self-contained master-detail workspace.
export const WarehousesPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <WarehousesWorkspace />;
    return <WarehousesListViews />;
};

const WarehousesListViews = () => {
    const data = useWarehousesData();
    const { isMobile } = useViewport();
    return isMobile
        ? <WarehousesPageMobile {...data} />
        : <WarehousesPageDesktop {...data} />;
};

export default WarehousesPage;
