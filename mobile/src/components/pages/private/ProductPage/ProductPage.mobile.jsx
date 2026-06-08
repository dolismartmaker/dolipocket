import { FaArrowLeft, FaPen, FaTrash, FaBox, FaWrench, FaBarcode, FaWeight, FaRulerHorizontal } from "react-icons/fa";

import { Page, Button } from "@cap-rel/smartcommon";

// Mobile rendering of the product detail page. Extracted verbatim from the
// previous monolithic index.jsx -- visually unchanged on mobile. Data and
// handlers come from useProductData via props.
export const ProductPageMobile = (props) => {
    const {
        product, loading, error, deleting,
        handleBack, handleEdit, handleDelete, handleStockNav,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {loading ? "Chargement..." : product?.label || "Produit"}
                        </h1>
                        {product && (
                            <p className="text-sm text-white/80">{product.ref}</p>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : error ? (
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : product ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                                {product.type === 1 ? (
                                    <><FaWrench className="text-purple-500" /> Service</>
                                ) : (
                                    <><FaBox className="text-blue-500" /> Produit</>
                                )}
                                {product.status === 0 && (
                                    <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Inactif</span>
                                )}
                            </div>

                            {product.description && (
                                <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{product.description}</p>
                            )}

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <div className="text-xs text-gray-400 uppercase">Prix HT</div>
                                    <div className="font-semibold text-gray-800">
                                        {Number(product.price ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-400 uppercase">TVA</div>
                                    <div className="font-semibold text-gray-800">{Number(product.tvaTx ?? 0)} %</div>
                                </div>
                                {product.priceTtc != null && product.priceTtc !== 0 && (
                                    <div>
                                        <div className="text-xs text-gray-400 uppercase">Prix TTC</div>
                                        <div className="font-semibold text-gray-800">
                                            {Number(product.priceTtc).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                                        </div>
                                    </div>
                                )}
                                {product.barcode && (
                                    <div className="col-span-2">
                                        <div className="text-xs text-gray-400 uppercase flex items-center gap-1">
                                            <FaBarcode /> Code-barres
                                        </div>
                                        <div className="font-mono text-gray-800">{product.barcode}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {product.type === 0 && (
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <div className="text-xs text-gray-400 uppercase mb-2">Stock</div>
                                <div className="text-2xl font-bold text-gray-800">
                                    {Number(product.stockReel ?? 0)}
                                </div>
                                <button
                                    onClick={handleStockNav}
                                    className="mt-3 text-sm text-primary underline"
                                >
                                    Ajuster le stock
                                </button>
                            </div>
                        )}

                        {(product.weight || product.length || product.width || product.height) && (
                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                <div className="text-xs text-gray-400 uppercase mb-2">Dimensions</div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    {!!product.weight && (
                                        <div className="flex items-center gap-2">
                                            <FaWeight className="text-gray-400" />
                                            <span>{product.weight} kg</span>
                                        </div>
                                    )}
                                    {!!product.length && (
                                        <div className="flex items-center gap-2">
                                            <FaRulerHorizontal className="text-gray-400" />
                                            <span>L {product.length}</span>
                                        </div>
                                    )}
                                    {!!product.width && (
                                        <div className="flex items-center gap-2">
                                            <FaRulerHorizontal className="text-gray-400" />
                                            <span>l {product.width}</span>
                                        </div>
                                    )}
                                    {!!product.height && (
                                        <div className="flex items-center gap-2">
                                            <FaRulerHorizontal className="text-gray-400" />
                                            <span>h {product.height}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile actions */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            onClick={handleDelete}
                            loading={deleting}
                            icon={FaTrash}
                            buttonProps={{ className: "flex-1 py-3 bg-red-100 text-red-600 rounded-xl flex items-center justify-center gap-2 font-medium" }}
                        >
                            Supprimer
                        </Button>
                        <Button
                            onClick={handleEdit}
                            icon={FaPen}
                            buttonProps={{ className: "flex-1 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium" }}
                        >
                            Modifier
                        </Button>
                    </div>
                </div>
            ) : null}
        </Page>
    );
};
