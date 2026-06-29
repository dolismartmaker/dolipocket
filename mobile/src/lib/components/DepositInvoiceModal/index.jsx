import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FaXmark, FaFileInvoiceDollar } from "react-icons/fa6";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";

// "Créer une facture d'acompte" modal. Tier A lot A5a.
//
// Reached from a validated proposal or order detail view. It lets the user pick
// a deposit-eligible payment term and a deposit percentage, then creates a
// TYPE_DEPOSIT invoice via POST invoice/deposit (faithful to commande/card.php:
// Dolibarr computes the amounts, this UI only carries the percentage + term).
//
// Props:
//   open        bool     Required. Visibility flag.
//   onClose     fn       Required. Called to dismiss the modal.
//   originType  string   'propal' | 'commande'.
//   originId    number   Origin document id.
//   originRef   string   Optional. Shown in the title.

const todayInput = () => new Date().toISOString().slice(0, 10);

export const DepositInvoiceModal = ({ open, onClose, originType, originId, originRef = "" }) => {
    const navigate = useNavigate();
    const dbInvoices = useDbInvoices();

    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [condReglementId, setCondReglementId] = useState("");
    const [depositPercent, setDepositPercent] = useState("");
    const [date, setDate] = useState(todayInput());
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setCondReglementId("");
        setDepositPercent("");
        setDate(todayInput());
        dbInvoices
            .depositTerms()
            .then((rows) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                setTerms(list);
                if (list.length > 0) {
                    setCondReglementId(String(list[0].id));
                    setDepositPercent(String(list[0].depositPercent ?? ""));
                }
            })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // Only re-run when the modal opens. dbInvoices is an unstable hook ref
        // (would loop) -- cf .claude/CLAUDE.md deps rule.
    }, [open]);

    if (!open) return null;

    const onTermChange = (value) => {
        setCondReglementId(value);
        const term = terms.find((t) => String(t.id) === String(value));
        if (term && (term.depositPercent ?? 0) > 0) {
            setDepositPercent(String(term.depositPercent));
        }
    };

    const submit = async () => {
        if (!condReglementId || Number(condReglementId) <= 0) {
            toast.error("Sélectionnez une condition de règlement avec acompte");
            return;
        }
        if (depositPercent === "" || Number(depositPercent) <= 0) {
            toast.error("Renseignez un pourcentage d'acompte valide");
            return;
        }
        setSubmitting(true);
        try {
            const created = await dbInvoices.createDeposit({
                originType,
                originId,
                condReglementId: Number(condReglementId),
                depositPercent: Number(depositPercent),
                date: date ? new Date(date).getTime() : undefined,
            });
            toast.success("Facture d'acompte créée");
            onClose?.();
            if (created?.id) {
                navigate(`/invoices/${created.id}`);
            }
        } catch (err) {
            console.error("createDeposit", err);
            toast.error("Création de la facture d'acompte impossible");
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = "h-[34px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none w-full";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl border border-soft-border shadow-lg w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border">
                    <h2 className="text-sm font-semibold text-strong-text flex items-center gap-2">
                        <FaFileInvoiceDollar className="text-soft-text" />
                        Facture d&apos;acompte{originRef ? ` - ${originRef}` : ""}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg transition-colors"
                        aria-label="Fermer"
                    >
                        <FaXmark className="text-sm" />
                    </button>
                </header>

                <div className="px-4 py-3 flex flex-col gap-3">
                    {loading && <div className="text-soft-text text-[13px]">Chargement...</div>}

                    {!loading && terms.length === 0 && (
                        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-3 py-2 text-[12px]">
                            Aucune condition de reglement avec acompte n&apos;est definie dans le dictionnaire. Configurez un pourcentage d&apos;acompte sur une condition de reglement pour activer cette fonction.
                        </div>
                    )}

                    {!loading && terms.length > 0 && (
                        <>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Condition de règlement (acompte)</span>
                                <select
                                    value={condReglementId}
                                    onChange={(e) => onTermChange(e.target.value)}
                                    className={inputCls}
                                >
                                    {terms.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.label} ({Number(t.depositPercent)} %)
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Pourcentage d&apos;acompte</span>
                                <input
                                    type="number" step="any" min="0" max="100"
                                    value={depositPercent}
                                    onChange={(e) => setDepositPercent(e.target.value)}
                                    className={inputCls}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Date de la facture</span>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className={inputCls}
                                />
                            </label>
                        </>
                    )}
                </div>

                <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-soft-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-[32px] px-3 rounded text-[12px] bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={submitting || loading || terms.length === 0}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <FaFileInvoiceDollar className="text-[11px]" />
                        <span>Créer l&apos;acompte</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};
