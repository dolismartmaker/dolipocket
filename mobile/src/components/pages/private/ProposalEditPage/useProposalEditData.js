import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbProposals } from "src/db/stores/proposals/useDbProposals";

// Data hook for the desktop ProposalEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, initialValues, describe, save, cancel }
export const useProposalEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbProposals = useDbProposals();

    const isNew = id === undefined || id === "new";
    const initialSocId = Number(search.get("socid") || 0) || null;

    const [proposal, setProposal] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbProposals.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbProposals
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setProposal(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useProposalEditData] dbProposals.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbProposals.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded proposal.
    // For new: a minimal default; the parent passed ?socid=N seeds the FK.
    const initialValues = isNew
        ? (initialSocId ? { fkSoc: initialSocId } : {})
        : (proposal ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            if (isNew) {
                const data = await dbProposals.create(values);
                if (data?.id) {
                    // Land on the detail page so the user can immediately add
                    // lines via the embedded DocumentLinesEditor (Lot 9).
                    navigate(`/proposals/${data.id}`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbProposals.update(id, values);
            setProposal(data);
            return data;
        } catch (err) {
            console.error("[useProposalEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbProposals, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/proposals");
        } else {
            navigate(`/proposals/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        proposal,
        setProposal, // exposed so DocumentLinesEditor can refresh after addLine/updateLine/deleteLine
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
        dbProposals,
    };
};
