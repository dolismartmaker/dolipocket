import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierProposals } from "src/db/stores/supplierProposals/useDbSupplierProposals";
import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// Data layer for the supplier price request create / edit header form.
// Lines are managed on the detail page (DocumentLinesEditor); this page only
// creates the draft for a supplier and edits the header metadata.

const tsToDateInput = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toISOString().slice(0, 10);
};

const dateInputToMs = (str) => {
    if (!str) return 0;
    const t = new Date(str).getTime();
    return Number.isFinite(t) ? t : 0;
};

export const useSupplierProposalEditData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;
    const dbSupplierProposals = useDbSupplierProposals();
    const dbThirdParties = useDbThirdParties();
    const hasClient = !!dbSupplierProposals.get;

    const { states, set } = useStates({
        suppliers: [],
        socid: "",
        deliveryDate: "",
        notePublic: "",
        notePrivate: "",
        loading: true,
        saving: false,
        error: null,
    });

    const { suppliers, socid, deliveryDate, notePublic, notePrivate, loading, saving, error } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            // Supplier list is only needed for the create flow (the supplier is
            // fixed once the draft exists).
            if (!isEdit) {
                const rows = await dbThirdParties.list({ perPage: 1000 }).catch(() => []);
                const all = Array.isArray(rows) ? rows : [];
                const onlySuppliers = all.filter((t) => Number(t.fournisseur) > 0);
                set("suppliers", onlySuppliers.length > 0 ? onlySuppliers : all);
            } else {
                const data = await dbSupplierProposals.get(id);
                if (!data) {
                    set("error", "Demande de prix introuvable");
                } else {
                    set("socid", String(data.socid ?? ""));
                    set("deliveryDate", tsToDateInput(data.deliveryDate));
                    set("notePublic", data.notePublic ?? "");
                    set("notePrivate", data.notePrivate ?? "");
                }
            }
        } catch (err) {
            console.error("useSupplierProposalEditData.load error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const goBack = () => {
        if (isEdit) navigate(`/supplier-proposals/${id}`);
        else navigate("/supplier-proposals");
    };

    const submit = async () => {
        if (!isEdit && (!socid || Number(socid) <= 0)) {
            toast.error("Sélectionnez un fournisseur");
            return;
        }
        set("saving", true);
        try {
            const local = {
                deliveryDate: dateInputToMs(deliveryDate),
                notePublic: notePublic ?? "",
                notePrivate: notePrivate ?? "",
            };
            if (isEdit) {
                const updated = await dbSupplierProposals.update(id, local);
                toast.success("Demande de prix mise à jour");
                navigate(`/supplier-proposals/${updated?.id ?? id}`);
            } else {
                const created = await dbSupplierProposals.create({ ...local, socid: Number(socid) });
                toast.success("Demande de prix créée");
                if (created?.id) {
                    navigate(`/supplier-proposals/${created.id}`);
                } else {
                    navigate("/supplier-proposals");
                }
            }
        } catch (err) {
            console.error("save supplier proposal", err);
            toast.error("Enregistrement impossible");
            set("saving", false);
        }
    };

    return {
        isEdit,
        suppliers,
        socid,
        deliveryDate,
        notePublic,
        notePrivate,
        loading,
        saving,
        error,
        set,
        goBack,
        submit,
    };
};
