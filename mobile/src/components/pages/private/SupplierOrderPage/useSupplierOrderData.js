import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";
import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";
import { downloadBlob, filenameFromContentDisposition } from "src/lib/utils/downloadBlob";

// Shared data layer for SupplierOrderPage (mobile + desktop). Workflow
// transitions: 0 draft -> 1 validated -> 2 approved -> 3 ordered -> 4/5 received.
export const STATUS_LABELS = {
    [-1]: "Annulée",
    0: "Brouillon",
    1: "Validée",
    2: "Approuvée",
    3: "Commandée",
    4: "Reçue partiellement",
    5: "Reçue",
    9: "Refusée",
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
export const useSupplierOrderData = (overrideId) => {
    const { id: routeId } = useParams();
    const id = overrideId != null ? String(overrideId) : routeId;
    const navigate = useNavigate();
    const dbSO = useDbSupplierOrders();
    const dbSI = useDbSupplierInvoices();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!dbSO.list;

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
            const data = await dbSO.get(id);
            set("order", data);
        } catch (err) {
            console.error("dbSO.get error", err);
            set("error", "Erreur de chargement de la commande fournisseur");
        } finally {
            set("loading", false);
        }
    };

    const runAction = async (label, fn) => {
        const ok = await confirm({
            type: "warning",
            title: `${label} la commande ?`,
            confirmText: label,
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await fn();
            set("order", data);
        } catch (err) {
            console.error(`dbSO.${label} error`, err);
            set("error", `Erreur lors de l'action "${label}"`);
        } finally {
            set("actionPending", false);
        }
    };

    const handleValidate = () => runAction("Valider", () => dbSO.validate(id));
    const handleApprove  = () => runAction("Approuver", () => dbSO.approve(id));
    const handleOrder    = () => runAction("Commander", () => dbSO.order(id, {}));
    const handleReceive  = () => runAction("Réceptionner", () => dbSO.receive(id, {}));

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette commande fournisseur ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbSO.remove(id);
            navigate("/supplier-orders", { replace: true });
        } catch (err) {
            console.error("dbSO.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const handleConvertToInvoice = async () => {
        const ok = await confirm({
            type: "info",
            title: "Créer une facture fournisseur ?",
            confirmText: "Créer la facture",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbSI.createFromOrder?.(id);
            if (data?.id) {
                navigate(`/supplier-invoices/${data.id}`);
            }
        } catch (err) {
            console.error("dbSI.createFromOrder error", err);
            set("error", "Erreur lors de la création de la facture");
        } finally {
            set("actionPending", false);
        }
    };

    const downloadPdfInternal = async () => {
        const { blob, contentDisposition } = await dbSO.downloadPdf(id);
        const fallback = `CmdeFournisseur-${order?.ref || id}.pdf`;
        const filename = filenameFromContentDisposition(contentDisposition, fallback);
        downloadBlob(blob, filename);
        return filename;
    };

    const handleGeneratePdf = async () => {
        set("actionPending", true);
        try {
            const res = await dbSO.generatePdf(id);
            const file = res?.file ?? "";
            toast.success(`PDF généré : ${file}`);
            try {
                const refreshed = await dbSO.get(id);
                if (refreshed) set("order", refreshed);
            } catch (refreshErr) {
                console.error("dbSO.get after generate error", refreshErr);
            }
            try {
                await downloadPdfInternal();
            } catch (dlErr) {
                console.error("dbSO.downloadPdf after generate error", dlErr);
            }
        } catch (err) {
            console.error("dbSO.generatePdf error", err);
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
            console.error("dbSO.downloadPdf error", err);
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
        return dbSO.sendEmail(id, payload);
    };

    const goEdit = () => navigate(`/supplier-orders/${id}/edit`);
    const goBack = () => navigate("/supplier-orders");

    const statut = Number(order?.statut ?? 0);

    return {
        id,
        order, loading, error, actionPending,
        statut,
        isDraft: statut === 0,
        canApprove: statut === 1,
        canOrder: statut === 2,
        canReceive: statut === 3 || statut === 4,
        canConvertToInvoice: statut >= 3,
        handleValidate, handleApprove, handleOrder, handleReceive,
        handleDelete, handleConvertToInvoice,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc: !!(order?.lastMainDoc),
        goEdit, goBack,
        dataSource: dbSO,
        // Expose a setter so the embedded DocumentLinesEditor can refresh
        // the supplier order state after addLine/updateLine/deleteLine.
        setSupplierOrder: (next) => set("order", next),
        // Send-by-email modal state.
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
    };
};
