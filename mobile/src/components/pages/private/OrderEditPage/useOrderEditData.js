import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";

// Data hook for the desktop OrderEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, order, initialValues, describe, save, cancel }
export const useOrderEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbOrders = useDbOrders();

    const isNew = id === undefined || id === "new";
    const initialSocId = Number(search.get("socid") || 0) || null;

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbOrders.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbOrders
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setOrder(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useOrderEditData] dbOrders.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbOrders.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded order.
    // For new: a minimal default; the parent passed ?socid=N seeds the FK.
    const initialValues = isNew
        ? (initialSocId ? { fkSoc: initialSocId, socid: initialSocId } : {})
        : (order ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            if (isNew) {
                const data = await dbOrders.create(values);
                if (data?.id) {
                    // Land on detail so the user can add lines immediately.
                    navigate(`/orders/${data.id}`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbOrders.update(id, values);
            setOrder(data);
            return data;
        } catch (err) {
            console.error("[useOrderEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbOrders, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/orders");
        } else {
            navigate(`/orders/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        order,
        setOrder, // exposed so DocumentLinesEditor can refresh after addLine/updateLine/deleteLine
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
        dbOrders,
    };
};
