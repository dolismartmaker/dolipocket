import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";

// Data hook for the desktop InvoiceEditPage. The mobile variant is the
// historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, invoice, initialValues, describe, save, cancel }
export const useInvoiceEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbInvoices = useDbInvoices();

    const isNew = id === undefined || id === "new";
    const initialSocId = Number(search.get("socid") || 0) || null;

    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbInvoices.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbInvoices
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setInvoice(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useInvoiceEditData] dbInvoices.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbInvoices.describe({ signal });
    }

    // Initial values to seed AutoForm with. For edit: use the loaded invoice.
    // For new: a minimal default; the parent passed ?socid=N seeds the FK.
    const initialValues = isNew
        ? (initialSocId ? { fkSoc: initialSocId, socid: initialSocId } : {})
        : (invoice ?? {});

    const save = useCallback(async (values) => {
        setSaving(true);
        setError(null);
        try {
            if (isNew) {
                const data = await dbInvoices.create(values);
                if (data?.id) {
                    // Land on detail so the user can add lines immediately.
                    navigate(`/invoices/${data.id}`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbInvoices.update(id, values);
            setInvoice(data);
            return data;
        } catch (err) {
            console.error("[useInvoiceEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbInvoices, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/invoices");
        } else {
            navigate(`/invoices/${id}`);
        }
    }, [id, isNew, navigate]);

    return {
        isNew,
        id,
        loading,
        saving,
        error,
        invoice,
        setInvoice, // exposed so DocumentLinesEditor can refresh after addLine/updateLine/deleteLine
        initialValues,
        describe: describeRef.current,
        save,
        cancel,
        dbInvoices,
    };
};
