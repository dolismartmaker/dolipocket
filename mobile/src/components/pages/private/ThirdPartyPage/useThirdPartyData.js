import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// Shared data layer for ThirdPartyPage (mobile + desktop). Owns the fetch,
// the delete action and the navigation helpers. Both views consume the
// same state and handlers; only presentation differs.
export const useThirdPartyData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbThirdParties = useDbThirdParties();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbThirdParties.get;

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        deleting: false,
        openSections: { identite: true, adresse: false, contact: false, fiscal: false, notes: false },
    });

    const { item, loading, error, deleting, openSections } = states ?? {};

    useEffect(() => {
        if (!hasClient || !id) return;
        loadThirdParty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadThirdParty = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbThirdParties.get(id);
            set("item", data);
        } catch (err) {
            console.error("dbThirdParties.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Tiers introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/thirdparties");
    const handleEdit = () => navigate(`/thirdparties/${id}/edit`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce tiers ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;

        set("deleting", true);
        try {
            await dbThirdParties.remove(id);
            navigate("/thirdparties", { replace: true });
        } catch (err) {
            console.error("dbThirdParties.remove error", err);
            set("error", "Suppression impossible");
            set("deleting", false);
        }
    };

    const toggleSection = (key) => {
        set(`openSections.${key}`, !openSections?.[key]);
    };

    return {
        id,
        item, loading, error, deleting, openSections,
        loadThirdParty, handleBack, handleEdit, handleDelete, toggleSection,
        dataSource: dbThirdParties,
    };
};
