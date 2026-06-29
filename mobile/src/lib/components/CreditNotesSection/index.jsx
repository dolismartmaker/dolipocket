import { useEffect, useState, useCallback } from "react";
import { FaFileInvoiceDollar, FaArrowsRotate, FaPlus } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useConfirm } from "@cap-rel/smartcommon";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Avoirs" (credit notes) section displayed on the customer invoice detail
// desktop view. Mirrors the Dolibarr credit-note box: it lists the credit
// notes attached to the invoice, surfaces the source invoice when the current
// document IS itself an avoir, and lets the user create a new draft credit
// note from a standard invoice.
//
// Server side: GET invoice/{id}/creditnotes + POST invoice/{id}/creditnote
// wired through the invoice controller. The POST returns a draft credit note
// that the user must validate afterwards.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight, separators via border-b, transition-colors only.
//
// Props:
//   invoiceId   number  Required. Dolibarr invoice id.
//   dataSource  object  Required. The useDbInvoices() hook instance exposing
//                       listCreditNotes / createCreditNote.
//   className   string  Optional extra class for the outer <section>.
export const CreditNotesSection = ({ invoiceId, dataSource, className = "" }) => {
    const [creditNotes, setCreditNotes] = useState([]);
    const [sourceInvoice, setSourceInvoice] = useState(null);
    const [selfType, setSelfType] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [creating, setCreating] = useState(false);

    const navigate = useNavigate();
    const { confirm } = useConfirm() ?? {};

    const hasClient = !!(dataSource && dataSource.listCreditNotes);

    // FR: amount formatter, deux décimales.
    const fmtAmount = (v) =>
        Number(v || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    // FR: libellé du type de facture.
    const typeLabel = (type) => {
        if (Number(type) === 2) return "Avoir";
        if (Number(type) === 3) return "Acompte";
        return "Facture";
    };

    const load = useCallback(async () => {
        if (!hasClient || !invoiceId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await dataSource.listCreditNotes(invoiceId);
            setCreditNotes(Array.isArray(data?.creditNotes) ? data.creditNotes : []);
            setSourceInvoice(data?.sourceInvoice ?? null);
            setSelfType(Number(data?.selfType ?? 0));
        } catch (err) {
            console.error("CreditNotesSection.load error", err);
            setError("Erreur de chargement des avoirs");
            setCreditNotes([]);
            setSourceInvoice(null);
            setSelfType(0);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, invoiceId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, invoiceId]);

    const handleCreate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Créer un avoir ?",
            message: "Un avoir brouillon sera créé à partir de cette facture, avec les montants inversés.",
            confirmText: "Créer l'avoir",
            cancelText: "Annuler",
        });
        if (!ok) return;
        setCreating(true);
        try {
            const created = await dataSource.createCreditNote(invoiceId);
            if (created?.id) navigate(`/invoices/${created.id}`);
        } catch (err) {
            console.error("CreditNotesSection.create error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de la création de l'avoir");
            }
        } finally {
            setCreating(false);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaFileInvoiceDollar className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Avoirs</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({creditNotes.length})</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser la liste"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">
                    {error}
                </div>
            )}

            {/* Source invoice: only present when the current document IS an avoir. */}
            {sourceInvoice && (
                <button
                    type="button"
                    onClick={() => navigate(`/invoices/${sourceInvoice.id}`)}
                    className="w-full text-left px-4 py-2 border-b border-soft-border text-[13px] text-primary hover:bg-medium-bg/50 transition-colors"
                >
                    Avoir de la facture {sourceInvoice.ref || `#${sourceInvoice.id}`}
                </button>
            )}

            <div className="px-2 py-1">
                {loading && creditNotes.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && creditNotes.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucun avoir
                    </div>
                )}

                {creditNotes.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {creditNotes.map((cn) => (
                            <li
                                key={cn.id}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/invoices/${cn.id}`)}
                                        className="text-[13px] text-primary truncate hover:underline"
                                    >
                                        {cn.ref || `#${cn.id}`}
                                    </button>
                                    <div className="text-[11px] text-soft-text truncate">
                                        {typeLabel(cn.type)}
                                    </div>
                                </div>
                                <div className="text-[13px] text-strong-text font-medium shrink-0">
                                    {fmtAmount(cn.totalTtc)} EUR
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Create a credit note: only from a standard invoice (selfType 0). */}
            {selfType === 0 && (
                <div className="border-t border-soft-border px-3 py-2.5">
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={creating}
                        className="h-[30px] w-full px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <FaPlus className="text-[11px]" />
                        <span>Créer un avoir</span>
                    </button>
                </div>
            )}
        </section>
    );
};
