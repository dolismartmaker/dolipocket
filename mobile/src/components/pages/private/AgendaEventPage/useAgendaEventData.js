import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Shared data layer for AgendaEventPage (mobile + desktop). Owns the fetch,
// the delete/markDone actions and the navigation helpers. Both views consume
// the same state and handlers; only presentation differs.
export const useAgendaEventData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbAgenda.list;

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { item, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (!hasClient || !id) return;
        loadEvent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadEvent = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbAgenda.get(id);
            set("item", data);
        } catch (err) {
            console.error("dbAgenda.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Évènement introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/agenda");
    const handleEdit = () => navigate(`/agenda/${id}/edit`);

    const handleDone = async () => {
        set("actionPending", true);
        try {
            const data = await dbAgenda.markDone(id);
            set("item", data);
        } catch (err) {
            console.error("dbAgenda.markDone error", err);
            set("error", "Impossible de marquer comme terminé");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cet évènement ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;

        set("actionPending", true);
        try {
            await dbAgenda.remove(id);
            navigate("/agenda", { replace: true });
        } catch (err) {
            console.error("dbAgenda.remove error", err);
            set("error", "Suppression impossible");
            set("actionPending", false);
        }
    };

    return {
        id,
        item, loading, error, actionPending,
        loadEvent, handleBack, handleEdit, handleDone, handleDelete,
        dataSource: dbAgenda,
    };
};
