import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";

// Shared data layer for ProductPage (mobile + desktop). Owns the fetch,
// the delete action and the navigation helpers. Both views consume the
// same state and handlers; only presentation differs.
export const useProductData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbProducts = useDbProducts();
    const { confirm } = useConfirm() ?? {};

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
            if (err?.response?.status === 404) {
                set("error", "Produit introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/products");
    const handleEdit = () => navigate(`/products/${id}/edit`);
    const handleStockNav = () => navigate(`/stock?product=${id}`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce produit",
            message: "Cette action est définitive.",
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
            set("deleting", false);
        }
    };

    return {
        id,
        product, loading, error, deleting,
        handleBack, handleEdit, handleDelete, handleStockNav,
        dataSource: dbProducts,
    };
};
