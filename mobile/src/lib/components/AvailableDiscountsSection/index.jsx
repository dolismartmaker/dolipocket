import { useEffect, useState, useCallback } from "react";
import { FaTags, FaArrowsRotate, FaPlus, FaXmark } from "react-icons/fa6";
import toast from "react-hot-toast";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Remises" (reusable absolute discounts / DiscountAbsolute) section on the
// customer invoice detail desktop view -- Tier A lot A5c.
//
// It surfaces two lists:
//   - Disponibles : the thirdparty's available (un-consumed) discounts. Each one
//     can be applied either as a negative LINE on a DRAFT invoice (applyMode
//     "line": pure discounts + deposits) or as a PAYMENT on a VALIDATED unpaid
//     invoice (applyMode "payment": credit notes + excess received). The two
//     modes mirror Dolibarr's remise_id / remise_id_for_payment forms.
//   - Appliquées sur cette facture : discounts already linked to this invoice,
//     with a "Retirer" action (line removal only on a draft; payment removal
//     while the invoice is not yet paid).
//
// Server side (cf .claude/CLAUDE.md "Tier A - A5c"):
//   GET  thirdparty/{id}/discounts   (available, via useDbThirdParties)
//   GET  invoice/{id}/discounts      (applied, via useDbInvoices)
//   POST invoice/{id}/discount       (apply as line)
//   POST invoice/{id}/usecreditnote  (apply as payment)
//   DELETE invoice/{id}/discount/{rowid} (remove)
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md): bg-white rounded-xl
// border border-soft-border (no shadow), density tight, separators via border,
// transition-colors only. Hardcoded FR strings (no i18n), like CreditNotesSection.
//
// Props:
//   invoice     object  Required. The mapped invoice (id, socid, statut, type, paye).
//   dataSource  object  Required. The useDbInvoices() hook instance exposing
//                       listAppliedDiscounts / applyDiscount / useCreditNote /
//                       removeDiscount.
//   onChange    func    Optional. Called with the refreshed invoice after an
//                       apply/remove so the parent page can update its state.
//   className   string  Optional extra class for the outer <section>.
export const AvailableDiscountsSection = ({ invoice, dataSource, onChange, className = "" }) => {
    const socid = Number(invoice?.socid ?? 0);
    const invoiceId = Number(invoice?.id ?? 0);
    const statut = Number(invoice?.statut ?? -1);
    const itype = Number(invoice?.type ?? 0);
    const isPaid = Number(invoice?.paye) === 1;

    const dbTp = useDbThirdParties();

    const [available, setAvailable] = useState([]);
    const [applied, setApplied] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(0);

    const hasClient = !!(
        dbTp && dbTp.discounts && dataSource && dataSource.listAppliedDiscounts
    );

    // FR: amount formatter, deux décimales.
    const fmtAmount = (v) =>
        Number(v || 0).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    // FR: libellé court du type de remise.
    const typeLabel = (t) => {
        if (t === "credit_note") return "Avoir";
        if (t === "deposit") return "Acompte";
        if (t === "excess") return "Trop-perçu";
        return "Remise";
    };

    const load = useCallback(async () => {
        if (!hasClient || !socid || !invoiceId) return;
        setLoading(true);
        setError(null);
        try {
            const [avail, app] = await Promise.all([
                dbTp.discounts(socid),
                dataSource.listAppliedDiscounts(invoiceId),
            ]);
            setAvailable(Array.isArray(avail) ? avail : []);
            setApplied(Array.isArray(app) ? app : []);
        } catch (err) {
            console.error("AvailableDiscountsSection.load error", err);
            setError("Erreur de chargement des remises");
            setAvailable([]);
            setApplied([]);
        } finally {
            setLoading(false);
        }
    }, [hasClient, socid, invoiceId]);

    useEffect(() => {
        load();
    }, [hasClient, socid, invoiceId]);

    // Whether an available discount can be applied right now, given its mode and
    // the invoice state. Mirrors core/tpl/object_discounts.tpl.php gating.
    const canApply = (d) => {
        if (d.applyMode === "line") return statut === 0; // draft only
        if (d.applyMode === "payment") return statut === 1 && !isPaid && itype !== 2;
        return false;
    };

    const applyHint = (d) => {
        if (d.applyMode === "line") {
            return statut === 0 ? "Appliquer comme ligne" : "Disponible sur une facture brouillon";
        }
        if (statut !== 1) return "Disponible sur une facture validée";
        if (isPaid) return "Facture déjà payée";
        if (itype === 2) return "Indisponible sur un avoir";
        return "Appliquer comme paiement";
    };

    const handleApply = async (d) => {
        if (!canApply(d)) return;
        setBusyId(d.id);
        try {
            const refreshed = d.applyMode === "payment"
                ? await dataSource.useCreditNote(invoiceId, d.id)
                : await dataSource.applyDiscount(invoiceId, d.id);
            if (refreshed && typeof onChange === "function") onChange(refreshed);
            await load();
        } catch (err) {
            console.error("AvailableDiscountsSection.apply error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de l'application de la remise");
            }
        } finally {
            setBusyId(0);
        }
    };

    const canRemove = (d) => {
        if (d.appliedAs === "line") return statut === 0; // draft only
        return !isPaid; // payment: invoice not yet paid
    };

    const handleRemove = async (d) => {
        if (!canRemove(d)) return;
        setBusyId(d.id);
        try {
            const refreshed = await dataSource.removeDiscount(invoiceId, d.id);
            if (refreshed && typeof onChange === "function") onChange(refreshed);
            await load();
        } catch (err) {
            console.error("AvailableDiscountsSection.remove error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du retrait de la remise");
            }
        } finally {
            setBusyId(0);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaTags className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Remises</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({available.length + applied.length})</span>
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

            {/* Disponibles */}
            <div className="px-4 py-1.5 border-b border-soft-border">
                <span className="text-[11px] uppercase tracking-wider text-soft-text">Disponibles</span>
            </div>
            <div className="px-2 py-1">
                {loading && available.length === 0 && (
                    <div className="px-2 py-3 text-center text-soft-text text-[12px]">Chargement...</div>
                )}
                {!loading && available.length === 0 && (
                    <div className="px-2 py-3 text-center text-soft-text text-[12px]">Aucune remise disponible</div>
                )}
                {available.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {available.map((d) => (
                            <li
                                key={d.id}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text font-medium">
                                        {fmtAmount(d.amountTtc)} EUR
                                    </div>
                                    <div className="text-[11px] text-soft-text truncate">
                                        {typeLabel(d.type)}
                                        {d.sourceInvoiceRef ? ` - ${d.sourceInvoiceRef}` : ""}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleApply(d)}
                                    disabled={busyId === d.id || !canApply(d)}
                                    title={applyHint(d)}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                                >
                                    <FaPlus className="text-[10px]" />
                                    <span>{d.applyMode === "payment" ? "Paiement" : "Appliquer"}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Appliquées sur cette facture */}
            <div className="px-4 py-1.5 border-b border-t border-soft-border">
                <span className="text-[11px] uppercase tracking-wider text-soft-text">Appliquées sur cette facture</span>
            </div>
            <div className="px-2 py-1">
                {!loading && applied.length === 0 && (
                    <div className="px-2 py-3 text-center text-soft-text text-[12px]">Aucune remise appliquée</div>
                )}
                {applied.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {applied.map((d) => (
                            <li
                                key={d.id}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text font-medium">
                                        {fmtAmount(d.amountTtc)} EUR
                                    </div>
                                    <div className="text-[11px] text-soft-text truncate">
                                        {typeLabel(d.type)}
                                        {" - "}
                                        {d.appliedAs === "payment" ? "paiement" : "ligne"}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(d)}
                                    disabled={busyId === d.id || !canRemove(d)}
                                    title={canRemove(d) ? "Retirer la remise" : "Retrait indisponible dans l'état actuel"}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 transition-colors shrink-0"
                                >
                                    <FaXmark className="text-[10px]" />
                                    <span>Retirer</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};
