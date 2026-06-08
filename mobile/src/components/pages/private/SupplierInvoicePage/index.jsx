import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useSupplierInvoiceData } from "./useSupplierInvoiceData";
import { SupplierInvoicePageMobile } from "./SupplierInvoicePage.mobile";
import { SupplierInvoicePageDesktop } from "./SupplierInvoicePage.desktop";
import { SupplierInvoicesWorkspace } from "../SupplierInvoicesPage/SupplierInvoicesPage.tablet";

// Viewport router for the supplier invoice detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). All data + handlers live in
// useSupplierInvoiceData; the two views are presentational only. On tablet,
// the detail route renders the same master-detail workspace as the list, with
// the document preselected from the URL (deep-link support) while keeping the
// list visible on the left.
export const SupplierInvoicePage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <SupplierInvoicesWorkspace initialId={id} />;
    return <SupplierInvoiceDetailViews />;
};

const SupplierInvoiceDetailViews = () => {
    const data = useSupplierInvoiceData();
    const { isDesktop } = useViewport();
    return isDesktop
        ? <SupplierInvoicePageDesktop {...data} />
        : <SupplierInvoicePageMobile {...data} />;
};

export default SupplierInvoicePage;
