import { useViewport } from "src/lib/viewport";

import { useReceptionsData } from "./useReceptionsData";
import { ReceptionsPageMobile } from "./ReceptionsPage.mobile";
import { ReceptionsPageDesktop } from "./ReceptionsPage.desktop";

// Viewport router pattern. Data lives in useReceptionsData(); .mobile and
// .desktop are pure render. Receptions are a desktop-first feature; tablet
// falls back to the desktop view.
export const ReceptionsPage = () => {
    const data = useReceptionsData();
    const { isMobile } = useViewport();
    return isMobile
        ? <ReceptionsPageMobile {...data} />
        : <ReceptionsPageDesktop {...data} />;
};

export default ReceptionsPage;
