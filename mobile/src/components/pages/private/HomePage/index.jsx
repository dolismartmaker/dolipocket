import { useViewport } from "src/lib/viewport";

import { useHomeData } from "./useHomeData";
import { HomePageMobile } from "./HomePage.mobile";
import { HomePageDesktop } from "./HomePage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering"):
// - useHomeData() owns data fetching and derived KPIs (single instance,
//   stable across viewport changes).
// - HomePageMobile / HomePageDesktop are presentation-only.
//
// IMPORTANT: never call data hooks (useDb*, useApi.get) inside
// HomePage.mobile.jsx or HomePage.desktop.jsx. They MUST stay pure render.
export const HomePage = () => {
    const data = useHomeData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <HomePageDesktop {...data} />
        : <HomePageMobile {...data} />;
};
