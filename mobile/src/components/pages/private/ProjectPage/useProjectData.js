import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProjects } from "src/db/stores/projects/useDbProjects";

// Shared data layer for the project detail page (mobile + desktop).

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

export const useProjectData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbProjects = useDbProjects();
    const { confirm } = useConfirm() ?? {};
    const hasClient = !!dbProjects.get;

    const { states, set } = useStates({
        project: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { project, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProjects.get(id);
            set("project", data ?? null);
            if (!data) set("error", "Projet introuvable");
        } catch (err) {
            console.error("dbProjects.get error", err);
            set("error", "Erreur de chargement du projet");
        } finally {
            set("loading", false);
        }
    };

    const runAction = async (fn, successMsg, errorMsg) => {
        set("actionPending", true);
        try {
            const updated = await fn();
            if (updated) set("project", updated);
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
        runAction(() => dbProjects.validate(id), "Projet validé", "Validation impossible");
    const handleClose = () =>
        runAction(() => dbProjects.close(id), "Projet fermé", "Fermeture impossible");
    const handleReopen = () =>
        runAction(() => dbProjects.reopen(id), "Projet rouvert", "Réouverture impossible");
    const handleSetDraft = () =>
        runAction(() => dbProjects.setDraft(id), "Projet repassé en brouillon", "Retour brouillon impossible");

    const handleClone = async () => {
        set("actionPending", true);
        try {
            const created = await dbProjects.clone(id);
            toast.success("Projet dupliqué");
            if (created?.id) {
                navigate(`/projects/${created.id}`);
            } else {
                set("actionPending", false);
            }
        } catch (err) {
            console.error("clone project", err);
            toast.error("Duplication impossible");
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        if (confirm) {
            const ok = await confirm({
                type: "delete",
                title: "Supprimer ce projet ?",
                message: "Cette action est irréversible.",
                confirmText: "Supprimer",
                cancelText: "Annuler",
            });
            if (!ok) return;
        }
        set("actionPending", true);
        try {
            await dbProjects.remove(id);
            toast.success("Projet supprimé");
            navigate("/projects");
        } catch (err) {
            console.error("delete project", err);
            toast.error("Suppression impossible");
            set("actionPending", false);
        }
    };

    const goEdit = () => navigate(`/projects/${id}/edit`);
    const goBack = () => navigate("/projects");

    const statut = Number(project?.statut ?? 0);

    return {
        navigate,
        dbProjects,
        project,
        loading,
        error,
        actionPending,
        isDraft: statut === 0,
        isOpen: statut === 1,
        isClosed: statut === 2,
        handleValidate,
        handleClose,
        handleReopen,
        handleSetDraft,
        handleClone,
        handleDelete,
        goEdit,
        goBack,
        reload: load,
    };
};
