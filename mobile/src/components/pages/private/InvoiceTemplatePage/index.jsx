import { useViewport } from "src/lib/viewport";

import { useInvoiceTemplateData } from "./useInvoiceTemplateData";
import { InvoiceTemplatePageMobile } from "./InvoiceTemplatePage.mobile";
import { InvoiceTemplatePageDesktop } from "./InvoiceTemplatePage.desktop";

// Viewport router for the recurring invoice template detail page. Data +
// handlers live in useInvoiceTemplateData(); the .mobile / .desktop files are
// pure render. Tablet falls back to the desktop view.
export const InvoiceTemplatePage = () => {
    const data = useInvoiceTemplateData();
    const { isMobile } = useViewport();
    return isMobile
        ? <InvoiceTemplatePageMobile {...data} />
        : <InvoiceTemplatePageDesktop {...data} />;
};

export default InvoiceTemplatePage;
