import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useProductData } from "./useProductData";
import { ProductPageMobile } from "./ProductPage.mobile";
import { ProductPageDesktop } from "./ProductPage.desktop";
import { ProductsWorkspace } from "../ProductsPage/ProductsPage.tablet";

// Viewport router for the product detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the same
// master-detail workspace as the list, with the record preselected from the
// URL (deep-link support) while keeping the list visible on the left.
export const ProductPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <ProductsWorkspace initialId={id} />;
    return <ProductDetailViews />;
};

const ProductDetailViews = () => {
    const data = useProductData();
    const { isDesktop } = useViewport();
    return isDesktop
        ? <ProductPageDesktop {...data} />
        : <ProductPageMobile {...data} />;
};

export default ProductPage;
