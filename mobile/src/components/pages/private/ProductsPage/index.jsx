import { useViewport } from "src/lib/viewport";

import { useProductsData } from "./useProductsData";
import { ProductsPageMobile } from "./ProductsPage.mobile";
import { ProductsPageDesktop } from "./ProductsPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// Data lives in useProductsData(); .mobile and .desktop are pure render.
export const ProductsPage = () => {
    const data = useProductsData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <ProductsPageDesktop {...data} />
        : <ProductsPageMobile {...data} />;
};

export default ProductsPage;
