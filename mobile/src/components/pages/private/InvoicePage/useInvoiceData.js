import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";

// Shared data layer for InvoicePage (mobile + desktop).
export const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Réglée",
    3: "Abandonnée",
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
export const useInvoiceData = (overrideId) => {
    const { id: routeId } = useParams();
    const id = overrideId != null ? String(overrideId) : routeId;
    const navigate = useNavigate();
    const dbInvoices = useDbInvoices();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbInvoices.list;

    const { states, set } = useStates({
        invoice: null,
        loading: true,
        error: null,
        actionPending: false,
        sendEmailOpen: false,
        paymentOpen: false,
    });

    const { invoice, loading, error, actionPending, sendEmailOpen, paymentOpen } = states ?? {};

    useEffect(() => {
        if (hasClient) loadInvoice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadInvoice = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbInvoices.get(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.get error", err);
            set("error", "Erreur de chargement de la facture");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider la facture ?",
            message: "Une référence définitive sera attribuée.",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.validate(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette facture ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbInvoices.remove(id);
            navigate("/invoices", { replace: true });
        } catch (err) {
            console.error("dbInvoices.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const downloadPdfInternal = async () => {
        const { blob, contentDisposition } = await dbInvoices.downloadPdf(id);
        const fallback = `Facture-${invoice?.ref || id}.pdf`;
        const filename = filenameFromContentDisposition(contentDisposition, fallback);
        downloadBlob(blob, filename);
        return filename;
    };

    const handleGeneratePdf = async () => {
        set("actionPending", true);
        try {
            const res = await dbInvoices.generatePdf(id);
            const file = res?.file ?? "";
            toast.success(`PDF généré : ${file}`);
            try {
                const refreshed = await dbInvoices.get(id);
                if (refreshed) set("invoice", refreshed);
            } catch (refreshErr) {
                console.error("dbInvoices.get after generate error", refreshErr);
            }
            try {
                await downloadPdfInternal();
            } catch (dlErr) {
                console.error("dbInvoices.downloadPdf after generate error", dlErr);
            }
        } catch (err) {
            console.error("dbInvoices.generatePdf error", err);
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
            console.error("dbInvoices.downloadPdf error", err);
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
        return dbInvoices.sendEmail(id, payload);
    };

    // Payment modal wiring. The submit handler hits POST /invoice/{id}/payment
    // and refreshes the local invoice state with the response so the "paye"
    // pill flips visibly.
    const openPayment = () => set("paymentOpen", true);
    const closePayment = () => set("paymentOpen", false);
    const submitPayment = async (payload) => {
        const res = await dbInvoices.addPayment(id, payload);
        if (res?.invoice) {
            set("invoice", res.invoice);
        } else {
            // Fallback: refetch if the backend response shape changed.
            await loadInvoice();
        }
        return res;
    };

    const goEdit = () => navigate(`/invoices/${id}/edit`);
    const goBack = () => navigate("/invoices");

    return {
        id,
        invoice, loading, error, actionPending,
        isDraft: invoice?.statut === 0,
        isPaid: Number(invoice?.paye) === 1,
        handleValidate, handleDelete,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc: !!(invoice?.lastMainDoc),
        goEdit, goBack,
        dataSource: dbInvoices,
        // Expose a setter so the embedded DocumentLinesEditor can refresh
        // the invoice state after addLine/updateLine/deleteLine.
        setInvoice: (next) => set("invoice", next),
        // Send-by-email modal state.
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
        // Record-payment modal state.
        paymentOpen, openPayment, closePayment, submitPayment,
    };
};
