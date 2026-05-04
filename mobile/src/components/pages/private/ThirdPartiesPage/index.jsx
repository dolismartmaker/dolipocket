import { useViewport } from "src/lib/viewport";

import { useThirdPartiesData } from "./useThirdPartiesData";
import { ThirdPartiesPageMobile } from "./ThirdPartiesPage.mobile";
import { ThirdPartiesPageDesktop } from "./ThirdPartiesPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useThirdPartiesData(); .mobile and .desktop are pure render.
export const ThirdPartiesPage = () => {
    const data = useThirdPartiesData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <ThirdPartiesPageDesktop {...data} />
        : <ThirdPartiesPageMobile {...data} />;
};
