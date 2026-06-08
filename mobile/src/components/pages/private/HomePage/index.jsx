import { useViewport } from "src/lib/viewport";

import { useHomeData } from "./useHomeData";
import { HomePageMobile } from "./HomePage.mobile";
import { HomePageDesktop } from "./HomePage.desktop";
import { HomePageTablet } from "./HomePage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering"):
// - useHomeData() owns data fetching and derived KPIs (single instance,
//   stable across viewport changes).
// - HomePageMobile / HomePageTablet / HomePageDesktop are presentation-only.
//
// IMPORTANT: never call data hooks (useDb*, useApi.get) inside the
// presentation files. They MUST stay pure render.
export const HomePage = () => {
    const data = useHomeData();
    const { isMobile, isTablet } = useViewport();

    if (isTablet) return <HomePageTablet {...data} />;
    return isMobile
        ? <HomePageMobile {...data} />
        : <HomePageDesktop {...data} />;
};
