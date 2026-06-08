import { useViewport } from "src/lib/viewport";

import { InvoiceEditPage as InvoiceEditPageMobile } from "./InvoiceEditPage.mobile";
import { InvoiceEditPageDesktop } from "./InvoiceEditPage.desktop";
import { InvoiceEditPageTablet } from "./InvoiceEditPage.tablet";
import { useInvoiceEditData } from "./useInvoiceEditData";

// Viewport router for the invoice edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation (with line accordions). Desktop and tablet both consume
// useInvoiceEditData() and render <AutoForm> + <DocumentLinesEditor>; the
// tablet variant uses a touch-sized chrome and a two-column form.
const DesktopWrapper = () => {
    const data = useInvoiceEditData();
    return <InvoiceEditPageDesktop {...data} />;
};

const TabletWrapper = () => {
    const data = useInvoiceEditData();
    return <InvoiceEditPageTablet {...data} />;
};

export const InvoiceEditPage = () => {
    const { isMobile, isTablet } = useViewport();
    if (isTablet) return <TabletWrapper />;
    return isMobile ? <InvoiceEditPageMobile /> : <DesktopWrapper />;
};
