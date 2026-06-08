import { useEffect, useRef, useState } from "react";
import { FaXmark, FaCreditCard, FaTriangleExclamation } from "react-icons/fa6";
import toast from "react-hot-toast";

// Reusable "Enregistrer un paiement" modal used by the customer invoice and
// supplier invoice detail pages (Lot todo.md #2). Records a single payment
// against the open invoice (mode + montant + date + référence libre + compte
// bancaire optionnel + note privée).
//
// Props:
//   open                 boolean
//   onClose              () => void
//   onSubmit             async ({amount, paymentMode, paymentDate, ref,
//                               fkAccount, note}) -> result
//                        The caller wires this to dbXxx.addPayment(id, ...).
//   defaultAmount        number  -- pre-filled with the remain-to-pay
//   currencyLabel        string  -- "EUR" by default, shown next to the amount
//   paymentModes         Array<{id:number, code:string, label:string}>
//                        -- pre-loaded list (caller fetches from a sellist
//                        endpoint or hardcodes the common ones). At least
//                        one entry is required for the modal to be usable.
//   bankAccounts         Array<{id:number, label:string}> -- optional
//   defaultPaymentMode   number  -- id of the mode to pre-select
//   defaultFkAccount     number  -- id of the bank account to pre-select
//   docLabel             string  -- "facture" / "facture fournisseur"
//
// Conventions UI desktop epurees (cf .claude/CLAUDE.md): modal is an explicit
// exception that wears shadow-lg, but no rounded-2xl / no double-encadrement.
export const AddPaymentModal = ({
    open,
    onClose,
    onSubmit,
    defaultAmount = 0,
    currencyLabel = "EUR",
    paymentModes = [],
    bankAccounts = [],
    defaultPaymentMode = 0,
    defaultFkAccount = 0,
    docLabel = "facture",
}) => {
    const todayIso = () => {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${m}-${day}`;
    };

    const [amount, setAmount] = useState(String(defaultAmount ?? ""));
    const [paymentMode, setPaymentMode] = useState(defaultPaymentMode || (paymentModes[0]?.id ?? 0));
    const [paymentDate, setPaymentDate] = useState(todayIso());
    const [ref, setRef] = useState("");
    const [fkAccount, setFkAccount] = useState(defaultFkAccount || 0);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const amountRef = useRef(null);

    // Refresh defaults whenever the modal re-opens.
    useEffect(() => {
        if (!open) return;
        setAmount(String(defaultAmount ?? ""));
        setPaymentMode(defaultPaymentMode || (paymentModes[0]?.id ?? 0));
        setPaymentDate(todayIso());
        setRef("");
        setFkAccount(defaultFkAccount || 0);
        setNote("");
        setError(null);
        setTimeout(() => {
            try { amountRef.current?.focus?.(); amountRef.current?.select?.(); } catch { /* noop */ }
        }, 50);
    }, [open, defaultAmount, defaultPaymentMode, defaultFkAccount, paymentModes]);

    if (!open) return null;

    const validate = () => {
        // Amount: must be a positive number.
        const n = Number(String(amount).replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) {
            return "Le montant doit être un nombre positif.";
        }
        if (defaultAmount && n > Number(defaultAmount) + 0.005) {
            return `Le montant ne peut pas dépasser le reste à payer (${defaultAmount} ${currencyLabel}).`;
        }
        if (!paymentMode || Number(paymentMode) <= 0) {
            return "Le mode de paiement est obligatoire.";
        }
        if (!paymentDate) {
            return "La date du paiement est obligatoire.";
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        setError(null);
        const v = validate();
        if (v) {
            setError(v);
            return;
        }
        setSubmitting(true);
        try {
            // Convert ISO date to epoch seconds. The backend normalises both
            // seconds and milliseconds, but we settle on seconds for clarity.
            const dateSec = Math.floor(new Date(paymentDate + "T00:00:00").getTime() / 1000);
            await onSubmit({
                amount: Number(String(amount).replace(",", ".")),
                paymentMode: Number(paymentMode),
                paymentDate: dateSec,
                ref: ref.trim(),
                fkAccount: Number(fkAccount) || 0,
                note,
            });
            toast.success("Paiement enregistré");
            onClose?.();
        } catch (err) {
            console.error("AddPaymentModal onSubmit error", err);
            const msg = err?.message || "Erreur lors de l'enregistrement du paiement";
            setError(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="addpayment-modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={submitting ? undefined : onClose}
            />

            {/* Modal panel */}
            <form
                onSubmit={handleSubmit}
                className="relative bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] flex flex-col shadow-lg"
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border">
                    <div className="flex items-center gap-2">
                        <FaCreditCard className="text-primary text-sm" />
                        <h2
                            id="addpayment-modal-title"
                            className="text-sm font-semibold text-strong-text"
                        >
                            Enregistrer un paiement -- {docLabel}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                        aria-label="Fermer"
                    >
                        <FaXmark className="text-sm" />
                    </button>
                </header>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {error && (
                        <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-md text-[13px] flex items-start gap-2">
                            <FaTriangleExclamation className="mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">
                            Montant ({currencyLabel})
                        </label>
                        <input
                            ref={amountRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={submitting}
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                            required
                        />
                        {defaultAmount > 0 && (
                            <p className="text-[11px] text-soft-text">
                                Reste à payer : {defaultAmount} {currencyLabel}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">
                            Mode de paiement
                        </label>
                        <select
                            value={paymentMode}
                            onChange={(e) => setPaymentMode(Number(e.target.value))}
                            disabled={submitting || paymentModes.length === 0}
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg bg-white"
                            required
                        >
                            {paymentModes.length === 0 && (
                                <option value="0">-- Aucun mode disponible --</option>
                            )}
                            {paymentModes.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.label} {m.code ? `(${m.code})` : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">
                            Date du paiement
                        </label>
                        <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            disabled={submitting}
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">
                            Référence (numéro de chèque, virement, etc.)
                        </label>
                        <input
                            type="text"
                            value={ref}
                            onChange={(e) => setRef(e.target.value)}
                            disabled={submitting}
                            placeholder="optionnel"
                            maxLength={100}
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                        />
                    </div>

                    {bankAccounts.length > 0 && (
                        <div className="space-y-1">
                            <label className="block text-xs font-medium text-soft-text">
                                Compte bancaire (optionnel)
                            </label>
                            <select
                                value={fkAccount}
                                onChange={(e) => setFkAccount(Number(e.target.value))}
                                disabled={submitting}
                                className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg bg-white"
                            >
                                <option value="0">-- Aucun --</option>
                                {bankAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">
                            Note (visible uniquement en interne)
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            disabled={submitting}
                            rows={3}
                            className="w-full p-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg resize-y"
                        />
                    </div>
                </div>

                {/* Footer */}
                <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-soft-border">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="h-[32px] px-3 rounded text-[12px] bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                        <FaCreditCard className="text-[11px]" />
                        <span>{submitting ? "Enregistrement..." : "Enregistrer le paiement"}</span>
                    </button>
                </footer>
            </form>
        </div>
    );
};
