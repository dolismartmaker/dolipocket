import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";

// Data hook for the desktop ContactEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, contact, initialValues, describe, save, cancel }
export const useContactEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbContacts = useDbContacts();

    const isNew = id === undefined || id === "new";
    const initialSocId = Number(search.get("socid") || 0) || null;

    const [contact, setContact] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbContacts.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbContacts
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setContact(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useContactEditData] dbContacts.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbContacts.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded contact.
    // For new: the optional ?socid=N fragment seeds the FK.
    const initialValues = isNew
        ? (initialSocId ? { fkSoc: initialSocId, statut: 1 } : { statut: 1 })
        : (contact ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            const payload = { ...values };
            if (payload.fkSoc !== undefined) payload.fkSoc = Number(payload.fkSoc ?? 0);
            if (payload.statut !== undefined) payload.statut = Number(payload.statut ?? 1);

            if (isNew) {
                const data = await dbContacts.create(payload);
                if (data?.id) {
                    navigate(`/contacts/${data.id}/edit`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbContacts.update(id, payload);
            setContact(data);
            return data;
        } catch (err) {
            console.error("[useContactEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbContacts, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/contacts");
        } else {
            navigate(`/contacts/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        contact,
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
    };
};
