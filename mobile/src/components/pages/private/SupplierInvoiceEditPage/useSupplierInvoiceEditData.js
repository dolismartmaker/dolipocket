import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";

// Data hook for the desktop SupplierInvoiceEditPage. The mobile variant is
// the historical monolithic implementation and does not use this hook.
//
// Returns:
//   { isNew, id, loading, saving, error, invoice, initialValues, describe, save, cancel }
export const useSupplierInvoiceEditData = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const dbSI = useDbSupplierInvoices();

    const isNew = id === undefined || id === "new";
    const initialSocId = Number(search.get("socid") || 0) || null;

    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasClient = !!dbSI.list;

    useEffect(() => {
        if (!hasClient || isNew) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        dbSI
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setInvoice(data);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useSupplierInvoiceEditData] dbSI.get error", err);
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
        describeRef.current = ({ signal } = {}) => dbSI.describe({ signal });
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
                const data = await dbSI.create(values);
                if (data?.id) {
                    // Land on detail so the user can add lines immediately.
                    navigate(`/supplier-invoices/${data.id}`, { replace: true });
                    return data;
                }
                setError("Création échouée");
                return null;
            }
            const data = await dbSI.update(id, values);
            setInvoice(data);
            return data;
        } catch (err) {
            console.error("[useSupplierInvoiceEditData] save error", err);
            setError("Erreur lors de l'enregistrement");
            return null;
        } finally {
            setSaving(false);
        }
    }, [dbSI, id, isNew, navigate]);

    const cancel = useCallback(() => {
        if (isNew) {
            navigate("/supplier-invoices");
        } else {
            navigate(`/supplier-invoices/${id}`);
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
        dbSupplierInvoices: dbSI,
    };
};
