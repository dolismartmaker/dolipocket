import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDbProducts } from "src/db/stores/products/useDbProducts";

// Data hook for the desktop ProductEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, product, initialValues, describe, save, cancel }
export const useProductEditData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbProducts = useDbProducts();

    const isNew = id === undefined || id === "new";

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbProducts.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbProducts
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setProduct(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useProductEditData] dbProducts.get error", err);
                setError("Erreur de chargement");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [hasClient, id, isNew]);

    // Pin describe to a stable reference so AutoForm's effect runs once.
    const describeRef = useRef(null);
    if (describeRef.current === null) {
        describeRef.current = ({ signal } = {}) => dbProducts.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded product.
    // For new: sensible defaults (product, sellable, buyable, 20% VAT).
    const initialValues = isNew
        ? { type: 0, status: 1, statusBuy: 1, tvaTx: 20 }
        : (product ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            const payload = { ...values };
            // Coerce numeric fields where applicable
            if (payload.type !== undefined) payload.type = Number(payload.type ?? 0);
            if (payload.price !== undefined) payload.price = Number(payload.price ?? 0);
            if (payload.tvaTx !== undefined) payload.tvaTx = Number(payload.tvaTx ?? 0);
            if (payload.status !== undefined) payload.status = Number(payload.status ?? 1);
            if (payload.statusBuy !== undefined) payload.statusBuy = Number(payload.statusBuy ?? 1);

            if (isNew) {
                const data = await dbProducts.create(payload);
                if (data?.id) {
                    navigate(`/products/${data.id}/edit`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbProducts.update(id, payload);
            setProduct(data);
            return data;
        } catch (err) {
            console.error("[useProductEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbProducts, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/products");
        } else {
            navigate(`/products/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        product,
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
    };
};
