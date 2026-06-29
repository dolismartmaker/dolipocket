import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// Shared data layer for SupplierInvoicePage (mobile + desktop). Mirrors
// useInvoiceData / useSupplierOrderData patterns.
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
    if (typeof ts === "string") {
        const parsed = Date.parse(ts);
        if (Number.isNaN(parsed)) return "";
        return new Date(parsed).toLocaleDateString("fr-FR");
    }
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

// `overrideId` lets the tablet master-detail workspace drive this hook from an
// in-pane selection instead of the URL param (the detail route is not changed
// when the user taps a row in the list). When omitted (mobile / desktop detail
// route), the URL param is used exactly as before -- fully backward compatible.
export const useSupplierInvoiceData = (overrideId) => {
    const { id: routeId } = useParams();
    const id = overrideId != null ? String(overrideId) : routeId;
    const navigate = useNavigate();
    const dbSI = useDbSupplierInvoices();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbSI.list;

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
            const data = await dbSI.get(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbSI.get error", err);
            set("error", "Erreur de chargement de la facture fournisseur");
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
            const data = await dbSI.validate(id);
            set("invoice", data);
            await loadInvoice();
        } catch (err) {
            console.error("dbSI.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    // Status transition: validated (1) -> draft (0).
    const handleSetDraft = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Repasser en brouillon ?",
            message: "La facture fournisseur redeviendra librement modifiable.",
            confirmText: "Repasser en brouillon",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbSI.setDraft(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbSI.setDraft error", err);
            set("error", "Erreur lors du retour en brouillon");
        } finally {
            set("actionPending", false);
        }
    };

    // Status transition: validated (1) -> paid (2).
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
            const data = await dbSI.setPaid(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbSI.setPaid error", err);
            set("error", "Erreur lors du classement payée");
        } finally {
            set("actionPending", false);
        }
    };

    // Status transition: paid (2) -> unpaid/validated (1).
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
            const data = await dbSI.setUnpaid(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbSI.setUnpaid error", err);
            set("error", "Erreur lors du retour en impayée");
        } finally {
            set("actionPending", false);
        }
    };

    // Duplicate the supplier invoice into a fresh draft and navigate to it.
    const handleClone = async () => {
        const ok = await confirm({
            type: "info",
            title: "Dupliquer cette facture fournisseur ?",
            message: "Une nouvelle facture fournisseur brouillon sera créée à partir de celle-ci.",
            confirmText: "Dupliquer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbSI.clone(id);
            if (data?.id) navigate(`/supplier-invoices/${data.id}`);
        } catch (err) {
            console.error("supplierInvoice.clone error", err);
            set("error", "Erreur lors de la duplication");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette facture fournisseur ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbSI.remove(id);
            navigate("/supplier-invoices", { replace: true });
        } catch (err) {
            console.error("dbSI.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const downloadPdfInternal = async () => {
        const { blob, contentDisposition } = await dbSI.downloadPdf(id);
        const fallback = `FactureFournisseur-${invoice?.ref || id}.pdf`;
        const filename = filenameFromContentDisposition(contentDisposition, fallback);
        downloadBlob(blob, filename);
        return filename;
    };

    const handleGeneratePdf = async () => {
        set("actionPending", true);
        try {
            const res = await dbSI.generatePdf(id);
            const file = res?.file ?? "";
            toast.success(`PDF généré : ${file}`);
            try {
                const refreshed = await dbSI.get(id);
                if (refreshed) set("invoice", refreshed);
            } catch (refreshErr) {
                console.error("dbSI.get after generate error", refreshErr);
            }
            try {
                await downloadPdfInternal();
            } catch (dlErr) {
                console.error("dbSI.downloadPdf after generate error", dlErr);
            }
        } catch (err) {
            console.error("dbSI.generatePdf error", err);
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
            console.error("dbSI.downloadPdf error", err);
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
        return dbSI.sendEmail(id, payload);
    };

    // Payment modal wiring. The submit handler hits POST
    // /supplierinvoice/{id}/payment and refreshes the local invoice state
    // with the response so the "paye" pill flips visibly.
    const openPayment = () => set("paymentOpen", true);
    const closePayment = () => set("paymentOpen", false);
    const submitPayment = async (payload) => {
        const res = await dbSI.addPayment(id, payload);
        if (res?.invoice) {
            set("invoice", res.invoice);
        } else {
            await loadInvoice();
        }
        return res;
    };

    const goEdit = () => navigate(`/supplier-invoices/${id}/edit`);
    const goBack = () => navigate("/supplier-invoices");

    const statut = Number(invoice?.statut ?? 0);
    const isPaid = Number(invoice?.paye ?? 0) === 1;

    return {
        id,
        invoice, loading, error, actionPending,
        statut,
        isDraft: statut === 0,
        isValidated: statut === 1,
        isPaid,
        handleValidate, handleSetDraft, handleSetPaid, handleSetUnpaid, handleClone, handleDelete,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc: !!(invoice?.lastMainDoc),
        goEdit, goBack,
        dataSource: dbSI,
        // Expose a setter so the embedded DocumentLinesEditor can refresh
        // the supplier invoice state after addLine/updateLine/deleteLine.
        setSupplierInvoice: (next) => set("invoice", next),
        // Send-by-email modal state.
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
        // Record-payment modal state.
        paymentOpen, openPayment, closePayment, submitPayment,
    };
};
