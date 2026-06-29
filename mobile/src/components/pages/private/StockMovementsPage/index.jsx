import { useViewport } from "src/lib/viewport";

import { useStockMovementsData } from "./useStockMovementsData";
import { StockMovementsPageMobile } from "./StockMovementsPage.mobile";
import { StockMovementsPageDesktop } from "./StockMovementsPage.desktop";

// Viewport router (cf .claude/CLAUDE.md viewport-aware pattern):
//   - mobile           -> gradient header + filters card + movement cards
//   - tablet / desktop -> sticky toolbar with inline filters + dense table
//
// useStockMovementsData() owns data fetching; the two views are pure render.
export const StockMovementsPage = () => {
    const data = useStockMovementsData();
    const { isMobile } = useViewport();
    return isMobile ? <StockMovementsPageMobile {...data} /> : <StockMovementsPageDesktop {...data} />;
};

export default StockMovementsPage;
