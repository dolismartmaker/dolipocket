import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { base64ToBlob, triggerDownload, canShare, shareVCard } from "../../../../utils/functions/vcard";

// Shared data layer for ContactPage (mobile + desktop). Owns the fetch,
// the delete + vCard export actions and the navigation helpers. Both
// views consume the same state and handlers; only presentation differs.
export const useContactData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbContacts = useDbContacts();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbContacts.get;

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        deleting: false,
        openSections: { identite: true, adresse: false, contact: false, poste: false, notes: false },
    });

    const { item, loading, error, deleting, openSections } = states ?? {};

    useEffect(() => {
        if (!hasClient || !id) return;
        loadContact();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadContact = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbContacts.get(id);
            set("item", data);
        } catch (err) {
            console.error("dbContacts.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Contact introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/contacts");
    const handleEdit = () => navigate(`/contacts/${id}/edit`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce contact ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;

        set("deleting", true);
        try {
            await dbContacts.remove(id);
            navigate("/contacts", { replace: true });
        } catch (err) {
            console.error("dbContacts.remove error", err);
            set("error", "Suppression impossible");
            set("deleting", false);
        }
    };

    const toggleSection = (key) => {
        set(`openSections.${key}`, !openSections?.[key]);
    };

    const fullName = item ? [item.civility, item.firstname, item.lastname].filter(Boolean).join(" ").trim() : "";

    const handleExportVCard = async () => {
        if (!item?.id) return;
        try {
            const data = await dbContacts.exportVcard(item.id);
            if (!data?.content) {
                set("error", "Export vCard impossible");
                return;
            }

            const blob = base64ToBlob(data.content, data["content-type"] || "text/vcard");
            const filename = data.filename || "contact.vcf";

            // Try Web Share API first (for mobile)
            if (canShare()) {
                const shared = await shareVCard(blob, filename, fullName || "Contact");
                if (shared) return;
            }

            // Fallback to download
            triggerDownload(blob, filename);
        } catch (err) {
            console.error("dbContacts.exportVcard error", err);
            set("error", "Export vCard impossible");
        }
    };

    return {
        id,
        item, loading, error, deleting, openSections, fullName,
        loadContact, handleBack, handleEdit, handleDelete, toggleSection, handleExportVCard,
        dataSource: dbContacts,
    };
};
