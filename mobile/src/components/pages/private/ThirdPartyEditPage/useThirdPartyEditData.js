import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// Data hook for the desktop ThirdPartyEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, thirdParty, initialValues, describe, save, cancel }
export const useThirdPartyEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbThirdParties = useDbThirdParties();

    const isNew = id === undefined || id === "new";

    // Pre-fill type from query params: ?type=client|fournisseur
    // ?back=1 means we should navigate(-1) after save (coming from a picker)
    const typeParam = search.get("type");
    const returnBack = search.get("back") === "1";
    const initialClient = typeParam === "fournisseur" ? 0 : 1;
    const initialFournisseur = typeParam === "fournisseur" ? 1 : 0;

    const [thirdParty, setThirdParty] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbThirdParties.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbThirdParties
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setThirdParty(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useThirdPartyEditData] dbThirdParties.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbThirdParties.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded thirdparty.
    // For new: defaults inferred from query params.
    const initialValues = isNew
        ? { client: initialClient, fournisseur: initialFournisseur }
        : (thirdParty ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            // Coerce numeric fields where applicable
            const payload = { ...values };
            if (payload.client !== undefined) payload.client = Number(payload.client ?? 0);
            if (payload.fournisseur !== undefined) payload.fournisseur = Number(payload.fournisseur ?? 0);

            if (isNew) {
                const data = await dbThirdParties.create(payload);
                if (data?.id) {
                    if (returnBack) {
                        navigate(-1);
                    } else {
                        navigate(`/thirdparties/${data.id}/edit`, { replace: true });
                    }
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbThirdParties.update(id, payload);
            setThirdParty(data);
            return data;
        } catch (err) {
            console.error("[useThirdPartyEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbThirdParties, id, isNew, navigate, returnBack]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/thirdparties");
        } else {
            navigate(`/thirdparties/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        thirdParty,
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
    };
};
