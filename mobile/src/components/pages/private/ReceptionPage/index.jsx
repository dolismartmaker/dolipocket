import { useViewport } from "src/lib/viewport";

import { useReceptionData } from "./useReceptionData";
import { ReceptionPageMobile } from "./ReceptionPage.mobile";
import { ReceptionPageDesktop } from "./ReceptionPage.desktop";

// Viewport router for the reception detail page. Data + handlers live in
// useReceptionData(); the .mobile / .desktop files are pure render. Receptions
// are desktop-first; tablet falls back to the desktop view.
export const ReceptionPage = () => {
    const data = useReceptionData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ReceptionPageMobile {...data} />
        : <ReceptionPageDesktop {...data} />;
};

export default ReceptionPage;
