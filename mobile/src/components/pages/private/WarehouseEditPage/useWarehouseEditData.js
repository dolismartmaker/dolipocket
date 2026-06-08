import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";

// Data hook for the desktop WarehouseEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, warehouse, initialValues, describe, save, cancel }
export const useWarehouseEditData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbWarehouses = useDbWarehouses();

    const isNew = id === undefined || id === "new";

    const [warehouse, setWarehouse] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbWarehouses.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbWarehouses
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setWarehouse(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useWarehouseEditData] dbWarehouses.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbWarehouses.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded warehouse.
    // For new: warehouse open by default.
    const initialValues = isNew
        ? { statut: 1 }
        : (warehouse ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            const payload = { ...values };
            if (payload.statut !== undefined) payload.statut = Number(payload.statut ?? 1);

            if (isNew) {
                const data = await dbWarehouses.create(payload);
                if (data?.id) {
                    navigate(`/warehouses/${data.id}/edit`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbWarehouses.update(id, payload);
            setWarehouse(data);
            return data;
        } catch (err) {
            console.error("[useWarehouseEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbWarehouses, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/warehouses");
        } else {
            navigate(`/warehouses/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        warehouse,
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
    };
};
