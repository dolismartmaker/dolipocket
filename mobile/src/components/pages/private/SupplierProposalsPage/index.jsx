import { useViewport } from "src/lib/viewport";

import { useSupplierProposalsData } from "./useSupplierProposalsData";
import { SupplierProposalsPageMobile } from "./SupplierProposalsPage.mobile";
import { SupplierProposalsPageDesktop } from "./SupplierProposalsPage.desktop";

// Viewport router. Data lives in useSupplierProposalsData(); .mobile and
// .desktop are pure render. Tablet falls back to the desktop view.
export const SupplierProposalsPage = () => {
    const data = useSupplierProposalsData();
    const { isMobile } = useViewport();
    return isMobile
        ? <SupplierProposalsPageMobile {...data} />
        : <SupplierProposalsPageDesktop {...data} />;
};

export default SupplierProposalsPage;
