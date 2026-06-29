import { useViewport } from "src/lib/viewport";

import { useStockData } from "./useStockData";
import { StockPageMobile } from "./StockPage.mobile";
import { StockPageDesktop } from "./StockPage.desktop";

// Viewport router (cf .claude/CLAUDE.md viewport-aware pattern):
//   - mobile           -> gradient header + product cards + inline adjust panel
//   - tablet / desktop -> dense table + sticky toolbar + adjustment modal
//
// useStockData() owns data fetching + adjustment state; the two views are pure
// render. The viewport is frozen for the session, so branching the whole
// subtree (and therefore which data hooks run) is safe.
export const StockPage = () => {
    const data = useStockData();
    const { isMobile } = useViewport();
    return isMobile ? <StockPageMobile {...data} /> : <StockPageDesktop {...data} />;
};

export default StockPage;
