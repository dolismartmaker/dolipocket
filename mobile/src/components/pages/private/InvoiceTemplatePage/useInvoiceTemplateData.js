import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbInvoiceRecs } from "src/db/stores/invoiceRecs/useDbInvoiceRecs";

// Shared data layer for the recurring invoice template detail page.

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

const tsToDateInput = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toISOString().slice(0, 10);
};

export const useInvoiceTemplateData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbInvoiceRecs = useDbInvoiceRecs();
    const hasClient = !!dbInvoiceRecs.get;

    const { states, set } = useStates({
        template: null,
        loading: true,
        error: null,
        actionPending: false,
        // editable settings form
        form: null,
    });

    const { template, loading, error, actionPending, form } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            load();
        }
    }, [hasClient, id]);

    const buildForm = (t) => ({
        title: t?.title ?? "",
        frequency: String(t?.frequency ?? 0),
        unitFrequency: t?.unitFrequency || "m",
        dateWhen: tsToDateInput(t?.dateWhen),
        nbGenMax: String(t?.nbGenMax ?? 0),
        autoValidate: !!t?.autoValidate,
        usenewprice: !!t?.usenewprice,
    });

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbInvoiceRecs.get(id);
            set("template", data ?? null);
            set("form", data ? buildForm(data) : null);
            if (!data) set("error", "Modèle introuvable");
        } catch (err) {
            console.error("dbInvoiceRecs.get error", err);
            set("error", "Erreur de chargement du modèle");
        } finally {
            set("loading", false);
        }
    };

    const setFormField = (field, value) => {
        set("form", { ...(form ?? {}), [field]: value });
    };

    const runAction = async (fn, successMsg, errorMsg) => {
        set("actionPending", true);
        try {
            const updated = await fn();
            if (updated) {
                set("template", updated);
                set("form", buildForm(updated));
            } else {
                await load();
            }
            if (successMsg) toast.success(successMsg);
        } catch (err) {
            console.error(errorMsg, err);
            toast.error(errorMsg);
        } finally {
            set("actionPending", false);
        }
    };

    const handleSuspend = () =>
        runAction(() => dbInvoiceRecs.suspend(id), "Modèle suspendu", "Suspension impossible");
    const handleUnsuspend = () =>
        runAction(() => dbInvoiceRecs.unsuspend(id), "Modèle réactivé", "Réactivation impossible");

    const handleGenerate = async () => {
        set("actionPending", true);
        try {
            const { template: updated, generated } = await dbInvoiceRecs.generate(id);
            if (updated) {
                set("template", updated);
                set("form", buildForm(updated));
            } else {
                await load();
            }
            if (generated) {
                toast.success("Facture générée depuis le modèle");
            } else {
                toast("Aucune facture générée : le modèle n'est pas encore échu", { icon: "i" });
            }
        } catch (err) {
            console.error("generate template", err);
            toast.error("Génération impossible");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSaveSettings = async () => {
        if (!form) return;
        set("actionPending", true);
        try {
            const local = {
                title: form.title,
                frequency: Number(form.frequency) || 0,
                unitFrequency: form.unitFrequency,
                dateWhen: form.dateWhen ? new Date(form.dateWhen).getTime() : 0,
                nbGenMax: Number(form.nbGenMax) || 0,
                autoValidate: form.autoValidate ? 1 : 0,
                usenewprice: form.usenewprice ? 1 : 0,
            };
            const updated = await dbInvoiceRecs.update(id, local);
            if (updated) {
                set("template", updated);
                set("form", buildForm(updated));
            }
            toast.success("Modèle mis à jour");
        } catch (err) {
            console.error("update template", err);
            toast.error("Mise à jour impossible");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        set("actionPending", true);
        try {
            await dbInvoiceRecs.remove(id);
            toast.success("Modèle supprimé");
            navigate("/invoice-templates");
        } catch (err) {
            console.error("delete template", err);
            toast.error("Suppression impossible");
            set("actionPending", false);
        }
    };

    const goBack = () => navigate("/invoice-templates");

    const suspended = Number(template?.suspended ?? 0);

    return {
        navigate,
        template,
        loading,
        error,
        actionPending,
        form,
        isSuspended: suspended === 1,
        setFormField,
        handleSuspend,
        handleUnsuspend,
        handleGenerate,
        handleSaveSettings,
        handleDelete,
        goBack,
        reload: load,
    };
};
