import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Data hook for the desktop AgendaEventEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, event, initialValues, describe, save, cancel }
export const useAgendaEventEditData = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();

    const isNew = id === undefined || id === "new";

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
        ? { typeCode: "AC_OTH", percentage: 0 }
        : (event ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            // Coerce numeric fields where applicable so the backend schema
            // (TYPE_INT / TYPE_BOOL) does not reject string values.
            const payload = { ...values };
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
