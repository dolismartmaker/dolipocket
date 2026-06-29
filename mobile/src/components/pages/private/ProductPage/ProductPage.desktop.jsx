import { FaArrowLeft, FaPen, FaTrash, FaBoxesStacked } from "react-icons/fa6";

import { DocumentHeaderFields } from "src/lib/datatable";
import { ProductExtrasSection } from "src/lib/components/ProductExtrasSection";
import { ProductVariantsSection } from "src/lib/components/ProductVariantsSection";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { useMenu } from "src/lib/permissions";

// Desktop rendering of the product detail page. Single-column centered
// layout (header-only document, no lines).
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées" :
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max)
//   - separators via border-b, never shadow
//   - hover:bg-medium-bg only, no transition-all, no hover:shadow-md
//   - no active:, no rounded-2xl, no gradient on cards.

const fmtAmount = (val) => {
    const n = Number(val ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const HEADER_OVERRIDES = {
    ref:         { defaultVisible: true },
    label:       { defaultVisible: true },
    type:        { defaultVisible: true,  formatter: (v) => Number(v) === 1 ? "Service" : "Produit" },
    status:      { defaultVisible: true,  formatter: (v) => Number(v) === 1 ? "Actif" : "Inactif" },
    price:       { defaultVisible: true,  formatter: (v) => `${fmtAmount(v)} EUR` },
    priceTtc:    { defaultVisible: true,  formatter: (v) => v != null && Number(v) !== 0 ? `${fmtAmount(v)} EUR` : "-" },
    tvaTx:       { defaultVisible: true,  formatter: (v) => v != null ? `${Number(v)} %` : "-" },
    barcode:     { defaultVisible: true },
    stockReel:   { defaultVisible: true,  formatter: (v) => Number(v ?? 0) },
    weight:      { defaultVisible: false, formatter: (v) => v ? `${v} kg` : "-" },
    length:      { defaultVisible: false },
    width:       { defaultVisible: false },
    height:      { defaultVisible: false },
};

export const ProductPageDesktop = (props) => {
    const {
        product, loading, error, deleting,
        handleBack, handleEdit, handleDelete, handleStockNav,
        dataSource,
    } = props;

    // Tier A - A4: enable the price write forms when the user can edit products.
    const { has } = useMenu();
    const canEditPrices = has("product.write");

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            {/* Sticky top action bar */}
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={handleBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour à la liste"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text truncate">
                    {loading ? "Chargement..." : (product?.label || "Produit")}
                </h1>
                {product?.ref && (
                    <span className="text-[12px] text-soft-text truncate">{product.ref}</span>
                )}

                <span className="flex-1" />

                {!loading && product && (
                    <div className="flex items-center gap-2">
                        {Number(product.type) === 0 && (
                            <button
                                type="button"
                                onClick={handleStockNav}
                                disabled={deleting}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                title="Voir les mouvements de stock"
                            >
                                <FaBoxesStacked className="text-[11px]" />
                                <span>Stock</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleEdit}
                            disabled={deleting}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <FaPen className="text-[11px]" />
                            <span>Modifier</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                        >
                            <FaTrash className="text-[11px]" />
                            <span>Supprimer</span>
                        </button>
                    </div>
                )}
            </header>

            {error && (
                <div className="shrink-0 mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                </div>
            )}

            {/* Centered single-column body */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && product && (
                    <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
                        <DocumentHeaderFields
                            object={product}
                            feature="product"
                            dataSource={dataSource}
                            storageKey="dolipocket.productpage.header"
                            title="Informations"
                            overrides={HEADER_OVERRIDES}
                        />
                        <ProductExtrasSection
                            productId={Number(product.id)}
                            dataSource={dataSource}
                            editable={canEditPrices}
                        />
                        <ProductVariantsSection
                            productId={Number(product.id)}
                            dataSource={dataSource}
                            editable={canEditPrices}
                        />
                        <DocumentsSection
                            objectType="product"
                            objectId={Number(product.id)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
