import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProjects } from "src/db/stores/projects/useDbProjects";
import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// Data layer for the project create / edit form. Single responsive form: on
// /new the user fills a fresh project; on /:id/edit the current values are
// loaded and sent back in full (a lossless round-trip, since the backend
// Project::update() persists every header column).

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

export const useProjectEditData = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;
    const dbProjects = useDbProjects();
    const dbThirdParties = useDbThirdParties();
    const hasClient = !!dbProjects.get;

    const { states, set } = useStates({
        thirdparties: [],
        title: "",
        socid: "",
        publicFlag: "0",
        dateStart: "",
        dateEnd: "",
        budget: "",
        oppAmount: "",
        oppPercent: "",
        description: "",
        notePublic: "",
        notePrivate: "",
        loading: true,
        saving: false,
        error: null,
    });

    const {
        thirdparties, title, socid, publicFlag, dateStart, dateEnd,
        budget, oppAmount, oppPercent, description, notePublic, notePrivate,
        loading, saving, error,
    } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            load();
        }
    }, [hasClient, id]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const rows = await dbThirdParties.list({ perPage: 1000 }).catch(() => []);
            set("thirdparties", Array.isArray(rows) ? rows : []);

            if (isEdit) {
                const data = await dbProjects.get(id);
                if (!data) {
                    set("error", "Projet introuvable");
                } else {
                    set("title", data.title ?? "");
                    set("socid", String(data.socid ?? ""));
                    set("publicFlag", String(Number(data.public) ? 1 : 0));
                    set("dateStart", tsToDateInput(data.dateStart));
                    set("dateEnd", tsToDateInput(data.dateEnd));
                    set("budget", data.budgetAmount ? String(data.budgetAmount) : "");
                    set("oppAmount", data.oppAmount ? String(data.oppAmount) : "");
                    set("oppPercent", data.oppPercent ? String(data.oppPercent) : "");
                    set("description", data.description ?? "");
                    set("notePublic", data.notePublic ?? "");
                    set("notePrivate", data.notePrivate ?? "");
                }
            }
        } catch (err) {
            console.error("useProjectEditData.load error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const goBack = () => {
        if (isEdit) navigate(`/projects/${id}`);
        else navigate("/projects");
    };

    const submit = async () => {
        if (!title || title.trim() === "") {
            toast.error("Le libellé est obligatoire");
            return;
        }
        set("saving", true);
        try {
            const local = {
                title: title.trim(),
                socid: socid ? Number(socid) : 0,
                public: Number(publicFlag) ? 1 : 0,
                dateStart: dateInputToMs(dateStart),
                dateEnd: dateInputToMs(dateEnd),
                budgetAmount: budget ? Number(budget) : 0,
                oppAmount: oppAmount ? Number(oppAmount) : 0,
                oppPercent: oppPercent ? Number(oppPercent) : 0,
                description: description ?? "",
                notePublic: notePublic ?? "",
                notePrivate: notePrivate ?? "",
            };
            if (isEdit) {
                const updated = await dbProjects.update(id, local);
                toast.success("Projet mis à jour");
                navigate(`/projects/${updated?.id ?? id}`);
            } else {
                const created = await dbProjects.create(local);
                toast.success("Projet créé");
                if (created?.id) {
                    navigate(`/projects/${created.id}`);
                } else {
                    navigate("/projects");
                }
            }
        } catch (err) {
            console.error("save project", err);
            toast.error("Enregistrement impossible");
            set("saving", false);
        }
    };

    return {
        isEdit,
        thirdparties,
        title,
        socid,
        publicFlag,
        dateStart,
        dateEnd,
        budget,
        oppAmount,
        oppPercent,
        description,
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
