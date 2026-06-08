import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useInvoiceData } from "./useInvoiceData";
import { InvoicePageMobile } from "./InvoicePage.mobile";
import { InvoicePageDesktop } from "./InvoicePage.desktop";
import { InvoicesWorkspace } from "../InvoicesPage/InvoicesPage.tablet";

// Viewport router for the invoice detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the document preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const InvoicePage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <InvoicesWorkspace initialId={id} />;
    return <InvoiceDetailViews />;
};

const InvoiceDetailViews = () => {
    const data = useInvoiceData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <InvoicePageDesktop {...data} />
        : <InvoicePageMobile {...data} />;
};
