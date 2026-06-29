import { useViewport } from "src/lib/viewport";

import { useInvoiceTemplatesData } from "./useInvoiceTemplatesData";
import { InvoiceTemplatesPageMobile } from "./InvoiceTemplatesPage.mobile";
import { InvoiceTemplatesPageDesktop } from "./InvoiceTemplatesPage.desktop";

// Viewport router. Data lives in useInvoiceTemplatesData(); .mobile and
// .desktop are pure render. Tablet falls back to the desktop view.
export const InvoiceTemplatesPage = () => {
    const data = useInvoiceTemplatesData();
    const { isMobile } = useViewport();
    return isMobile
        ? <InvoiceTemplatesPageMobile {...data} />
        : <InvoiceTemplatesPageDesktop {...data} />;
};

export default InvoiceTemplatesPage;
