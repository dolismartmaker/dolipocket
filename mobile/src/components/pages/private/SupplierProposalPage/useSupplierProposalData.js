import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierProposals } from "src/db/stores/supplierProposals/useDbSupplierProposals";

// Shared data layer for the supplier price request detail page.

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

export const useSupplierProposalData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbSupplierProposals = useDbSupplierProposals();
    const hasClient = !!dbSupplierProposals.get;

    const { states, set } = useStates({
        proposal: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { proposal, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbSupplierProposals.get(id);
            set("proposal", data ?? null);
            if (!data) set("error", "Demande de prix introuvable");
        } catch (err) {
            console.error("dbSupplierProposals.get error", err);
            set("error", "Erreur de chargement de la demande de prix");
        } finally {
            set("loading", false);
        }
    };

    const runAction = async (fn, successMsg, errorMsg) => {
        set("actionPending", true);
        try {
            const updated = await fn();
            if (updated) set("proposal", updated);
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
        runAction(() => dbSupplierProposals.validate(id), "Demande de prix validée", "Validation impossible");
    const handleSetDraft = () =>
        runAction(() => dbSupplierProposals.setDraft(id), "Demande repassée en brouillon", "Retour brouillon impossible");
    const handleCloseSigned = () =>
        runAction(() => dbSupplierProposals.closeSigned(id), "Demande de prix signée", "Action impossible");
    const handleCloseUnsigned = () =>
        runAction(() => dbSupplierProposals.closeUnsigned(id), "Demande de prix classée non signée", "Action impossible");
    const handleReopen = () =>
        runAction(() => dbSupplierProposals.reopen(id), "Demande de prix rouverte", "Réouverture impossible");

    const handleClone = async () => {
        set("actionPending", true);
        try {
            const created = await dbSupplierProposals.clone(id);
            toast.success("Demande de prix dupliquée");
            if (created?.id) {
                navigate(`/supplier-proposals/${created.id}`);
            } else {
                set("actionPending", false);
            }
        } catch (err) {
            console.error("clone supplier proposal", err);
            toast.error("Duplication impossible");
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        set("actionPending", true);
        try {
            await dbSupplierProposals.remove(id);
            toast.success("Demande de prix supprimée");
            navigate("/supplier-proposals");
        } catch (err) {
            console.error("delete supplier proposal", err);
            toast.error("Suppression impossible");
            set("actionPending", false);
        }
    };

    const goEdit = () => navigate(`/supplier-proposals/${id}/edit`);
    const goBack = () => navigate("/supplier-proposals");

    const statut = Number(proposal?.statut ?? 0);

    return {
        navigate,
        dbSupplierProposals,
        dataSource: dbSupplierProposals,
        proposal,
        loading,
        error,
        actionPending,
        isDraft: statut === 0,
        isValidated: statut === 1,
        isClosed: statut === 2 || statut === 3 || statut === 4,
        handleValidate,
        handleSetDraft,
        handleCloseSigned,
        handleCloseUnsigned,
        handleReopen,
        handleClone,
        handleDelete,
        goEdit,
        goBack,
        setProposal: (next) => set("proposal", next),
        reload: load,
    };
};
