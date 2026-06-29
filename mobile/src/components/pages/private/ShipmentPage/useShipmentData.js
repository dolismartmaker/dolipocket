import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbShipments } from "src/db/stores/shipments/useDbShipments";

// Shared data layer for the shipment detail page (mobile + desktop).
// Cf ~/docs/SMARTMAKER.md "Viewport-aware rendering": data + handlers live
// here, the .mobile / .desktop files are pure render.

export const fmtAmount = (val) => {
    const n = Number(val ?? 0);
    if (!Number.isFinite(n)) return "0,00";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

export const useShipmentData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbShipments = useDbShipments();
    const hasClient = !!dbShipments.get;

    const { states, set } = useStates({
        shipment: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { shipment, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbShipments.get(id);
            set("shipment", data ?? null);
            if (!data) set("error", "Expédition introuvable");
        } catch (err) {
            console.error("dbShipments.get error", err);
            set("error", "Erreur de chargement de l'expédition");
        } finally {
            set("loading", false);
        }
    };

    // Run a store action, refresh the detail, surface a toast.
    const runAction = async (fn, successMsg, errorMsg) => {
        set("actionPending", true);
        try {
            const updated = await fn();
            if (updated) set("shipment", updated);
            else await load();
            if (successMsg) toast.success(successMsg);
        } catch (err) {
            console.error(errorMsg, err);
            toast.error(errorMsg);
        } finally {
            set("actionPending", false);
        }
    };

    const handleValidate = () =>
        runAction(() => dbShipments.validate(id), "Expédition validée", "Validation impossible");
    const handleClose = () =>
        runAction(() => dbShipments.closeShipment(id), "Expédition classée traitée", "Clôture impossible");
    const handleReopen = () =>
        runAction(() => dbShipments.reopen(id), "Expédition rouverte", "Réouverture impossible");
    const handleSetDraft = () =>
        runAction(() => dbShipments.setDraft(id), "Expédition repassée en brouillon", "Retour brouillon impossible");
    const handleCancel = () =>
        runAction(() => dbShipments.cancel(id), "Expédition annulée", "Annulation impossible");

    const handleDelete = async () => {
        set("actionPending", true);
        try {
            await dbShipments.remove(id);
            toast.success("Expédition supprimée");
            navigate("/shipments");
        } catch (err) {
            console.error("delete shipment", err);
            toast.error("Suppression impossible");
            set("actionPending", false);
        }
    };

    const goBack = () => navigate("/shipments");

    const statut = Number(shipment?.statut ?? 0);

    return {
        navigate,
        dbShipments,
        shipment,
        loading,
        error,
        actionPending,
        isDraft: statut === 0,
        isValidated: statut === 1,
        isClosed: statut === 2,
        isCanceled: statut === -1,
        handleValidate,
        handleClose,
        handleReopen,
        handleSetDraft,
        handleCancel,
        handleDelete,
        goBack,
        reload: load,
    };
};
