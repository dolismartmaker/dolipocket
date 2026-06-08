import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";

// Shared data layer for WarehousePage (mobile + desktop). Owns the fetch,
// the delete action and the navigation helpers. Both views consume the
// same state and handlers; only presentation differs.
export const useWarehouseData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbWarehouses = useDbWarehouses();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbWarehouses.list;

    const { states, set } = useStates({
        warehouse: null,
        loading: true,
        error: null,
        deleting: false,
    });

    const { warehouse, loading, error, deleting } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            loadWarehouse();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadWarehouse = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbWarehouses.get(id);
            set("warehouse", data);
        } catch (err) {
            console.error("dbWarehouses.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Entrepôt introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/warehouses");
    const handleEdit = () => navigate(`/warehouses/${id}/edit`);
    const handleStockNav = () => navigate(`/stock?warehouse=${id}`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cet entrepôt",
            message: "Cette action est définitive. Les mouvements de stock historiques sont conservés.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;

        set("deleting", true);
        try {
            await dbWarehouses.remove(id);
            navigate("/warehouses", { replace: true });
        } catch (err) {
            console.error("dbWarehouses.remove error", err);
            set("error", "Echec de la suppression");
            set("deleting", false);
        }
    };

    return {
        id,
        warehouse, loading, error, deleting,
        handleBack, handleEdit, handleDelete, handleStockNav,
        dataSource: dbWarehouses,
    };
};
