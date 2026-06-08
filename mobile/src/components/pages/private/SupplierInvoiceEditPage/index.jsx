import { useViewport } from "src/lib/viewport";

import { SupplierInvoiceEditPage as SupplierInvoiceEditPageMobile } from "./SupplierInvoiceEditPage.mobile";
import { SupplierInvoiceEditPageDesktop } from "./SupplierInvoiceEditPage.desktop";
import { SupplierInvoiceEditPageTablet } from "./SupplierInvoiceEditPage.tablet";
import { useSupplierInvoiceEditData } from "./useSupplierInvoiceEditData";

// Viewport router for the supplier invoice edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation (with line accordions). Desktop and tablet both consume
// useSupplierInvoiceEditData() and render <AutoForm> + <DocumentLinesEditor>;
// the tablet variant uses a touch-sized chrome and a two-column form.
const DesktopWrapper = () => {
    const data = useSupplierInvoiceEditData();
    return <SupplierInvoiceEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useSupplierInvoiceEditData();
    return <SupplierInvoiceEditPageTablet {...data} />;
};

export const SupplierInvoiceEditPage = () => {
    const { isDesktop, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isDesktop ? <DesktopWrapper /> : <SupplierInvoiceEditPageMobile />;
};
