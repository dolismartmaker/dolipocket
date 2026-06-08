import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";

// Shared data layer for OrderPage (mobile + desktop). Holds the order
// fetch, the workflow actions (validate / convertToInvoice / delete) and
// the navigation helpers.
export const STATUS_LABELS = {
    [-1]: "Annulé",
    0: "Brouillon",
    1: "Validé",
    2: "En cours",
    3: "Livré",
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
export const useOrderData = (overrideId) => {
    const { id: routeId } = useParams();
    const id = overrideId != null ? String(overrideId) : routeId;
    const navigate = useNavigate();
    const dbOrders = useDbOrders();
    const dbInvoices = useDbInvoices();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbOrders.list;

    const { states, set } = useStates({
        order: null,
        loading: true,
        error: null,
        actionPending: false,
        sendEmailOpen: false,
    });

    const { order, loading, error, actionPending, sendEmailOpen } = states ?? {};

    useEffect(() => {
        if (hasClient) loadOrder();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadOrder = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbOrders.get(id);
            set("order", data);
        } catch (err) {
            console.error("dbOrders.get error", err);
            set("error", "Erreur de chargement de la commande");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider la commande ?",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbOrders.validate(id);
            set("order", data);
        } catch (err) {
            console.error("dbOrders.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette commande ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbOrders.remove(id);
            navigate("/orders", { replace: true });
        } catch (err) {
            console.error("dbOrders.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const handleConvertToInvoice = async () => {
        const ok = await confirm({
            type: "info",
            title: "Créer une facture ?",
            message: "Une nouvelle facture sera créée à partir de cette commande.",
            confirmText: "Créer la facture",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.createFromOrder(id);
            if (data?.id) {
                navigate(`/invoices/${data.id}`);
            }
        } catch (err) {
            console.error("dbInvoices.createFromOrder error", err);
            set("error", "Erreur lors de la création de la facture");
        } finally {
            set("actionPending", false);
        }
    };

    // Internal: download the last generated PDF as a Blob, then trigger a
    // browser "Save as...". Throws on 404 (no PDF yet) and 410 (orphan).
    const downloadPdfInternal = async () => {
        const { blob, contentDisposition } = await dbOrders.downloadPdf(id);
        const fallback = `Commande-${order?.ref || id}.pdf`;
        const filename = filenameFromContentDisposition(contentDisposition, fallback);
        downloadBlob(blob, filename);
        return filename;
    };

    const handleGeneratePdf = async () => {
        set("actionPending", true);
        try {
            const res = await dbOrders.generatePdf(id);
            const file = res?.file ?? "";
            toast.success(`PDF généré : ${file}`);
            try {
                const refreshed = await dbOrders.get(id);
                if (refreshed) set("order", refreshed);
            } catch (refreshErr) {
                console.error("dbOrders.get after generate error", refreshErr);
            }
            try {
                await downloadPdfInternal();
            } catch (dlErr) {
                console.error("dbOrders.downloadPdf after generate error", dlErr);
            }
        } catch (err) {
            console.error("dbOrders.generatePdf error", err);
            toast.error("Erreur lors de la génération du PDF");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDownloadPdf = async () => {
        set("actionPending", true);
        try {
            await downloadPdfInternal();
        } catch (err) {
            console.error("dbOrders.downloadPdf error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 404) {
                toast.error("Aucun PDF généré. Cliquez d'abord sur Générer PDF.");
            } else if (status === 410) {
                toast.error("Le fichier PDF n'existe plus. Régénérez-le.");
            } else if (status === 403) {
                toast.error("Accès refusé.");
            } else {
                toast.error("Erreur lors du téléchargement du PDF");
            }
        } finally {
            set("actionPending", false);
        }
    };

    const openSendEmail = () => set("sendEmailOpen", true);
    const closeSendEmail = () => set("sendEmailOpen", false);
    const submitSendEmail = async (payload) => {
        return dbOrders.sendEmail(id, payload);
    };

    const goEdit = () => navigate(`/orders/${id}/edit`);
    const goBack = () => navigate("/orders");

    return {
        id,
        order, loading, error, actionPending,
        isDraft: order?.statut === 0,
        isValidated: order?.statut === 1 || order?.statut === 2,
        handleValidate, handleDelete, handleConvertToInvoice,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc: !!(order?.lastMainDoc),
        goEdit, goBack,
        dataSource: dbOrders,
        // Expose a setter so the embedded DocumentLinesEditor can refresh
        // the order state after addLine/updateLine/deleteLine.
        setOrder: (next) => set("order", next),
        // Send-by-email modal state.
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
    };
};
