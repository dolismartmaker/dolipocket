import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProposals } from "src/db/stores/proposals/useDbProposals";
import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// Shared data layer for ProposalPage (mobile + desktop). Holds the proposal
// fetch, the workflow actions (validate / closeSigned / closeUnsigned / delete)
// and the navigation helper to the edit page.
//
// Both views consume the same `state` and `handlers` -- presentation only
// differs in layout and styling.
export const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validé",
    2: "Signé",
    3: "Non signé",
    4: "Facturé",
};

export const fmtAmount = (val) => {
    const n = Number(val ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

// `overrideId` lets the tablet master-detail workspace drive this hook from an
// in-pane selection instead of the URL param (the detail route is not changed
// when the user taps a row in the list). When omitted (mobile / desktop detail
// route), the URL param is used exactly as before -- fully backward compatible.
export const useProposalData = (overrideId) => {
    const { id: routeId } = useParams();
    const id = overrideId != null ? String(overrideId) : routeId;
    const navigate = useNavigate();
    const dbProposals = useDbProposals();
    const dbOrders = useDbOrders();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbProposals.list;

    const { states, set } = useStates({
        proposal: null,
        loading: true,
        error: null,
        actionPending: false,
        sendEmailOpen: false,
    });

    const { proposal, loading, error, actionPending, sendEmailOpen } = states ?? {};

    useEffect(() => {
        if (hasClient) loadProposal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadProposal = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProposals.get(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.get error", err);
            set("error", "Erreur de chargement du devis");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider le devis ?",
            message: "Le devis ne pourra plus être modifié librement.",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.validate(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSign = async () => {
        const ok = await confirm({
            type: "info",
            title: "Marquer comme signé ?",
            confirmText: "Signé",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.closeSigned(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.closeSigned error", err);
            set("error", "Erreur lors de la signature");
        } finally {
            set("actionPending", false);
        }
    };

    const handleUnsign = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Marquer comme non signé ?",
            confirmText: "Non signé",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.closeUnsigned(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.closeUnsigned error", err);
            set("error", "Erreur lors du refus");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSetDraft = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Repasser en brouillon ?",
            message: "Le devis redeviendra librement modifiable.",
            confirmText: "Repasser en brouillon",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.setDraft(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.setDraft error", err);
            set("error", "Erreur lors du retour en brouillon");
        } finally {
            set("actionPending", false);
        }
    };

    const handleClassifyBilled = async () => {
        const ok = await confirm({
            type: "info",
            title: "Classer facturé ?",
            message: "Le devis sera marqué comme facturé.",
            confirmText: "Classer facturé",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.classifyBilled(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.classifyBilled error", err);
            set("error", "Erreur lors du classement facturé");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce devis ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbProposals.remove(id);
            navigate("/proposals", { replace: true });
        } catch (err) {
            console.error("dbProposals.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const handleConvertToOrder = async () => {
        const ok = await confirm({
            type: "info",
            title: "Créer une commande ?",
            message: "Une nouvelle commande sera créée à partir de ce devis.",
            confirmText: "Créer la commande",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbOrders.createFromProposal(id);
            if (data?.id) {
                navigate(`/orders/${data.id}`);
            }
        } catch (err) {
            console.error("dbOrders.createFromProposal error", err);
            set("error", "Erreur lors de la création de la commande");
        } finally {
            set("actionPending", false);
        }
    };

    const handleClone = async () => {
        const ok = await confirm({
            type: "info",
            title: "Dupliquer ce devis ?",
            message: "Un nouveau devis brouillon sera créé à partir de celui-ci.",
            confirmText: "Dupliquer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.clone(id);
            if (data?.id) {
                navigate(`/proposals/${data.id}`);
            }
        } catch (err) {
            console.error("dbProposals.clone error", err);
            set("error", "Erreur lors de la duplication");
        } finally {
            set("actionPending", false);
        }
    };

    const openSendEmail = () => set("sendEmailOpen", true);
    const closeSendEmail = () => set("sendEmailOpen", false);

    // Submit handler wired into <SendEmailModal onSend={...}>. The modal
    // already validates the recipient + subject before calling us, so we
    // can forward the payload as-is. Throws on backend failure so the modal
    // can surface the error message.
    const submitSendEmail = async (payload) => {
        return dbProposals.sendEmail(id, payload);
    };

    // Internal: download the last generated PDF as a Blob, then trigger a
    // browser "Save as..." via a synthetic <a download>. Throws when no PDF
    // has been generated yet (404) or the file is missing on disk (410).
    const downloadPdfInternal = async () => {
        const { blob, contentDisposition } = await dbProposals.downloadPdf(id);
        const fallback = `Devis-${proposal?.ref || id}.pdf`;
        const filename = filenameFromContentDisposition(contentDisposition, fallback);
        downloadBlob(blob, filename);
        return filename;
    };

    const handleGeneratePdf = async () => {
        set("actionPending", true);
        try {
            const res = await dbProposals.generatePdf(id);
            const file = res?.file ?? "";
            toast.success(`PDF généré : ${file}`);
            // Reload to refresh last_main_doc on the local proposal object,
            // then auto-trigger the download for the fresh PDF.
            try {
                const refreshed = await dbProposals.get(id);
                if (refreshed) set("proposal", refreshed);
            } catch (refreshErr) {
                console.error("dbProposals.get after generate error", refreshErr);
            }
            try {
                await downloadPdfInternal();
            } catch (dlErr) {
                console.error("dbProposals.downloadPdf after generate error", dlErr);
                // Non-fatal: PDF was generated successfully; user can retry
                // via the "Télécharger PDF" button.
            }
        } catch (err) {
            console.error("dbProposals.generatePdf error", err);
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            set("actionPending", false);
        }
    };

    // Standalone "Télécharger PDF" button: reads last_main_doc, never
    // regenerates. Surfaces a clear toast on 404 (PDF jamais généré) and
    // 410 (fichier orphelin sur disque).
    const handleDownloadPdf = async () => {
        set("actionPending", true);
        try {
            await downloadPdfInternal();
        } catch (err) {
            console.error("dbProposals.downloadPdf error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 404) {
                toast.error("Aucun PDF généré. Cliquez d'abord sur Générer PDF.");
            } else if (status === 410) {
                toast.error("Le fichier PDF n'existe plus. Régénérez-le.");
            } else if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du téléchargement du PDF");
            }
        } finally {
            set("actionPending", false);
        }
    };

    const goEdit = () => navigate(`/proposals/${id}/edit`);
    const goBack = () => navigate("/proposals");

    return {
        id,
        proposal, loading, error, actionPending,
        isDraft: proposal?.statut === 0,
        isValidated: proposal?.statut === 1,
        isSigned: proposal?.statut === 2,
        handleValidate, handleSign, handleUnsign, handleDelete,
        handleSetDraft, handleClassifyBilled,
        handleConvertToOrder,
        handleClone,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc: !!(proposal?.lastMainDoc),
        goEdit, goBack,
        dataSource: dbProposals,
        // Expose a setter so the embedded DocumentLinesEditor can refresh
        // the proposal state after addLine/updateLine/deleteLine.
        setProposal: (next) => set("proposal", next),
        // Send-by-email modal state.
        sendEmailOpen,
        openSendEmail,
        closeSendEmail,
        submitSendEmail,
    };
};
