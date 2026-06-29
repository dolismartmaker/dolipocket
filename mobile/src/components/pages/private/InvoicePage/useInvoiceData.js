import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

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

    // Status-classification transitions. Distinct from addPayment (recording a
    // real payment): these just reclassify the invoice status server-side.
    const handleSetDraft = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Repasser en brouillon ?",
            message: "La facture redeviendra librement modifiable.",
            confirmText: "Repasser en brouillon",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.setDraft(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.setDraft error", err);
            set("error", "Erreur lors du retour en brouillon");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSetPaid = async () => {
        const ok = await confirm({
            type: "info",
            title: "Classer payée ?",
            message: "La facture sera classée payée.",
            confirmText: "Classer payée",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.setPaid(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.setPaid error", err);
            set("error", "Erreur lors du classement en payée");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSetCanceled = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Classer abandonnée ?",
            message: "La facture sera classée abandonnée.",
            confirmText: "Classer abandonnée",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.setCanceled(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.setCanceled error", err);
            set("error", "Erreur lors du classement en abandonnée");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSetUnpaid = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Repasser en impayée ?",
            message: "La facture repassera en impayée.",
            confirmText: "Repasser en impayée",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.setUnpaid(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.setUnpaid error", err);
            set("error", "Erreur lors du retour en impayée");
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

    // Clone the invoice into a fresh draft and navigate to it.
    const handleClone = async () => {
        const ok = await confirm({
            type: "info",
            title: "Dupliquer cette facture ?",
            message: "Une nouvelle facture brouillon sera créée à partir de celle-ci.",
            confirmText: "Dupliquer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.clone(id);
            if (data?.id) navigate(`/invoices/${data.id}`);
        } catch (err) {
            console.error("dbInvoices.clone error", err);
            set("error", "Erreur lors de la duplication");
        } finally {
            set("actionPending", false);
        }
    };

    // Tier A - A5c: convert this invoice (credit note / deposit / standard with
    // excess received) into one or more reusable discounts on the thirdparty.
    // The backend re-checks eligibility ($canconvert) and classifies the source
    // invoice as paid (except for a deposit).
    const handleConvertToReduc = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Convertir en remise ?",
            message: "Cette facture sera convertie en remise(s) réutilisable(s) sur le client, par taux de TVA.",
            confirmText: "Convertir en remise",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.convertToReduc(id);
            if (data) set("invoice", data);
            toast.success("Remise créée");
        } catch (err) {
            console.error("dbInvoices.convertToReduc error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de la conversion en remise");
            }
        } finally {
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
                notifyAccessDenied(err);
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
        // Status-based flags (Dolibarr Facture statut: 0=draft, 1=validated,
        // 2=paid, 3=abandoned). `isPaid` above stays mapped to the `paye`
        // flag for the payment pill -- these are the classification flags.
        isValidated: invoice?.statut === 1,
        isStatusPaid: invoice?.statut === 2,
        isAbandoned: invoice?.statut === 3,
        handleValidate, handleDelete, handleClone,
        handleSetDraft, handleSetPaid, handleSetCanceled, handleSetUnpaid,
        handleConvertToReduc,
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
