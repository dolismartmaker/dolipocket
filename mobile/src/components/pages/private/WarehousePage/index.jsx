import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useWarehouseData } from "./useWarehouseData";
import { WarehousePageMobile } from "./WarehousePage.mobile";
import { WarehousePageDesktop } from "./WarehousePage.desktop";
import { WarehousesWorkspace } from "../WarehousesPage/WarehousesPage.tablet";

// Viewport router for the warehouse detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the record preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const WarehousePage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <WarehousesWorkspace initialId={id} />;
    return <WarehouseDetailViews />;
};

const WarehouseDetailViews = () => {
    const data = useWarehouseData();
    const { isMobile } = useViewport();
    return isMobile
        ? <WarehousePageMobile {...data} />
        : <WarehousePageDesktop {...data} />;
};

export default WarehousePage;
