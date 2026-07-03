import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Coerce a date field to unix SECONDS. The smartcommon datetime <Input> stores
// values in MILLISECONDS, while the backend (and an existing event loaded for
// edit) uses seconds. Any value clearly in the millisecond range is converted.
const toSeconds = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return n;
    return Math.abs(n) >= 1e11 ? Math.floor(n / 1000) : n;
};

// Data hook for the desktop AgendaEventEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, event, initialValues, describe, save, cancel }
export const useAgendaEventEditData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const [searchParams] = useSearchParams();

    const isNew = id === undefined || id === "new";

    // Calendar click-to-create passes ?datep=<unix seconds>. AutoForm's
    // datetime field expects milliseconds, so seed in ms.
    const datepParam = Number(searchParams.get("datep"));
    const seededDatepMs = isNew && Number.isFinite(datepParam) && datepParam > 0
        ? datepParam * 1000
        : null;
    const datefParam = Number(searchParams.get("datef"));
    const seededDatefMs = isNew && Number.isFinite(datefParam) && datefParam > 0
        ? datefParam * 1000
        : null;

    // "Nouvel événement" from a thirdparty fiche passes ?socid=<id> to
    // pre-link the event to that thirdparty.
    const socidParam = Number(searchParams.get("socid"));
    const seededSocid = isNew && Number.isFinite(socidParam) && socidParam > 0
        ? socidParam
        : null;

    // The quick-create modal's "Plus de détails" hands off its typed fields via
    // the query string. Seed them so nothing the user entered is lost. AutoForm
    // keys are camelCase (note_private -> notePrivate); dates are handled above.
    const labelParam = isNew ? (searchParams.get("label") || "") : "";
    const locationParam = isNew ? (searchParams.get("location") || "") : "";
    const noteParam = isNew ? (searchParams.get("note_private") || "") : "";
    const seededFullDay = isNew && searchParams.get("fulldayevent") === "1";

    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbAgenda.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbAgenda
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setEvent(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useAgendaEventEditData] dbAgenda.get error", err);
                setError("Erreur de chargement");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [hasClient, id, isNew]);

    // Pin describe to a stable reference so AutoForm's effect runs once.
    const describeRef = useRef(null);
    if (describeRef.current === null) {
        describeRef.current = ({ signal } = {}) => dbAgenda.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded event.
    // For new: a minimal default that mirrors the mobile form (type AC_OTH).
    const initialValues = isNew
        ? {
            typeCode: "AC_OTH",
            percentage: 0,
            ...(labelParam ? { label: labelParam } : {}),
            ...(locationParam ? { location: locationParam } : {}),
            ...(noteParam ? { note: noteParam } : {}),
            ...(seededDatepMs ? { datep: seededDatepMs } : {}),
            ...(seededDatefMs ? { datef: seededDatefMs } : {}),
            ...(seededFullDay ? { fulldayevent: true } : {}),
            ...(seededSocid ? { fkSoc: seededSocid } : {}),
        }
        : (event ?? {});

    const save = useCallback(async (values) => {
        // Required-field validation (mirrors the mobile form). The label is
        // mandatory: without this guard the desktop "Enregistrer" button -- which
        // calls save() directly, bypassing the form's onSubmit -- silently sent
        // an empty label (create -> backend 400, update -> blank saved), leaving
        // the user with no hint that the field is required.
        if (!values?.label || String(values.label).trim() === "") {
            setError("Le libellé est obligatoire");
            return null;
        }
        setSaving(true);
        setError(null);
        try {
            // Coerce numeric fields where applicable so the backend schema
            // (TYPE_INT / TYPE_BOOL) does not reject string values.
            const payload = { ...values };
            // datep/datef come from AutoForm in milliseconds (or seconds when an
            // untouched loaded event is re-saved); backend expects seconds.
            if (payload.datep !== undefined && payload.datep !== null && payload.datep !== "") {
                payload.datep = toSeconds(payload.datep);
            }
            if (payload.datef !== undefined && payload.datef !== null && payload.datef !== "") {
                payload.datef = toSeconds(payload.datef);
            }
            if (payload.percentage !== undefined) payload.percentage = Number(payload.percentage ?? 0);
            if (payload.fulldayevent !== undefined) payload.fulldayevent = payload.fulldayevent ? 1 : 0;
            if (payload.socid !== undefined) payload.socid = Number(payload.socid ?? 0);
            if (payload.fkContact !== undefined) payload.fkContact = Number(payload.fkContact ?? 0);
            if (payload.fkUserAssigned !== undefined) payload.fkUserAssigned = Number(payload.fkUserAssigned ?? 0);

            if (isNew) {
                const data = await dbAgenda.create(payload);
                if (data?.id) {
                    navigate(`/agenda/${data.id}`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbAgenda.update(id, payload);
            setEvent(data);
            // Success feedback: return to the detail page (mirrors create), so
            // the user sees the saved event instead of a form that "did nothing".
            navigate(`/agenda/${id}`);
            return data;
        } catch (err) {
            console.error("[useAgendaEventEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbAgenda, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/agenda");
        } else {
            navigate(`/agenda/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        event,
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
    };
};
