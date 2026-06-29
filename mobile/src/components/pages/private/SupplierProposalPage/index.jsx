import { useViewport } from "src/lib/viewport";

import { useSupplierProposalData } from "./useSupplierProposalData";
import { SupplierProposalPageMobile } from "./SupplierProposalPage.mobile";
import { SupplierProposalPageDesktop } from "./SupplierProposalPage.desktop";

// Viewport router for the supplier price request detail page. Data + handlers
// live in useSupplierProposalData(); the .mobile / .desktop files are pure
// render. Tablet falls back to the desktop view.
export const SupplierProposalPage = () => {
    const data = useSupplierProposalData();
    const { isMobile } = useViewport();
    return isMobile
        ? <SupplierProposalPageMobile {...data} />
        : <SupplierProposalPageDesktop {...data} />;
};

export default SupplierProposalPage;
