import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbReceptions } from "src/db/stores/receptions/useDbReceptions";

// Shared data layer for the reception detail page (mobile + desktop).

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

export const useReceptionData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbReceptions = useDbReceptions();
    const hasClient = !!dbReceptions.get;

    const { states, set } = useStates({
        reception: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { reception, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbReceptions.get(id);
            set("reception", data ?? null);
            if (!data) set("error", "Réception introuvable");
        } catch (err) {
            console.error("dbReceptions.get error", err);
            set("error", "Erreur de chargement de la réception");
        } finally {
            set("loading", false);
        }
    };

    const runAction = async (fn, successMsg, errorMsg) => {
        set("actionPending", true);
        try {
            const updated = await fn();
            if (updated) set("reception", updated);
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
        runAction(() => dbReceptions.validate(id), "Réception validée", "Validation impossible");
    const handleClose = () =>
        runAction(() => dbReceptions.closeReception(id), "Réception classée reçue", "Clôture impossible");
    const handleReopen = () =>
        runAction(() => dbReceptions.reopen(id), "Réception rouverte", "Réouverture impossible");
    const handleSetDraft = () =>
        runAction(() => dbReceptions.setDraft(id), "Réception repassée en brouillon", "Retour brouillon impossible");

    const handleDelete = async () => {
        set("actionPending", true);
        try {
            await dbReceptions.remove(id);
            toast.success("Réception supprimée");
            navigate("/receptions");
        } catch (err) {
            console.error("delete reception", err);
            toast.error("Suppression impossible");
            set("actionPending", false);
        }
    };

    const goBack = () => navigate("/receptions");

    const statut = Number(reception?.statut ?? 0);

    return {
        navigate,
        dbReceptions,
        reception,
        loading,
        error,
        actionPending,
        isDraft: statut === 0,
        isValidated: statut === 1,
        isClosed: statut === 2,
        handleValidate,
        handleClose,
        handleReopen,
        handleSetDraft,
        handleDelete,
        goBack,
        reload: load,
    };
};
