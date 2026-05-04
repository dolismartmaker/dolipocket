import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaBox, FaWrench, FaBarcode, FaWeight, FaRulerHorizontal } from "react-icons/fa";

import { Page, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";

/**
 * ProductPage: read-only detail view of a product or service.
 *
 * Shows base attributes (ref, label, price, vat, stock, dimensions) and
 * exposes Edit / Delete actions. The Edit action navigates to ProductEditPage.
 */
export const ProductPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbProducts = useDbProducts();
    const { confirm } = useConfirm();
    const hasClient = !!dbProducts.list;

    const { states, set } = useStates({
        product: null,
        loading: true,
        error: null,
        deleting: false,
    });

    const { product, loading, error, deleting } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            loadProduct();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadProduct = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProducts.get(id);
            set("product", data);
        } catch (err) {
            console.error("dbProducts.get error", err);
            if (err.response?.status === 404) {
                set("error", "Produit introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => {
        navigate("/products");
    };

    const handleEdit = () => {
        navigate(`/products/${id}/edit`);
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce produit",
            message: "Cette action est definitive.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("deleting", true);
        try {
            await dbProducts.remove(id);
            navigate("/products", { replace: true });
        } catch (err) {
            console.error("dbProducts.remove error", err);
            set("error", "Echec de la suppression");
        } finally {
            set("deleting", false);
        }
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {loading ? "Chargement..." : product?.label || "Produit"}
                        </h1>
                        {product && (
                            <p className="text-sm text-white/80 md:text-gray-500">{product.ref}</p>
                        )}
                    </div>
                    {/* Desktop actions in header */}
                    {product && (
                        <div className="hidden md:flex md:items-center md:gap-2">
                            <Button
                                onClick={handleDelete}
                                loading={deleting}
                                icon={FaTrash}
                                buttonProps={{ className: "px-4 py-2 bg-red-100 text-red-600 rounded-lg flex items-center gap-2 font-medium text-sm" }}
                            >
                                Supprimer
                            </Button>
                            <Button
                                onClick={handleEdit}
                                icon={FaPen}
                                buttonProps={{ className: "px-4 py-2 bg-primary text-white rounded-lg flex items-center gap-2 font-medium text-sm" }}
                            >
                                Modifier
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : error ? (
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : product ? (
                <div className="p-4 md:px-6 md:max-w-5xl md:mx-auto flex flex-col gap-4">
                    <div className="md:grid md:grid-cols-2 md:gap-4 flex flex-col gap-4">
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
                                    onClick={() => navigate(`/stock?product=${product.id}`)}
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
                    <div className="flex gap-3 pt-2 md:hidden">
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

export default ProductPage;
