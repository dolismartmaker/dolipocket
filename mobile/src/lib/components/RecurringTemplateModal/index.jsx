import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { FaXmark, FaRepeat } from "react-icons/fa6";

import { useDbInvoiceRecs } from "src/db/stores/invoiceRecs/useDbInvoiceRecs";

// "Créer un modèle récurrent" modal. Tier A lot A5b.
//
// Reached from an invoice detail view. It creates a FactureRec template from
// the current invoice (lines + thirdparty are copied server-side) with a
// frequency + first generation date. After creation, navigates to the new
// template detail.
//
// Props:
//   open        bool     Visibility flag.
//   onClose     fn       Dismiss the modal.
//   invoiceId   number   Source invoice id.
//   invoiceRef  string   Source invoice ref (used as the default title).

const todayInput = () => new Date().toISOString().slice(0, 10);

export const RecurringTemplateModal = ({ open, onClose, invoiceId, invoiceRef = "" }) => {
    const navigate = useNavigate();
    const dbInvoiceRecs = useDbInvoiceRecs();

    const [title, setTitle] = useState("");
    const [frequency, setFrequency] = useState("1");
    const [unitFrequency, setUnitFrequency] = useState("m");
    const [dateWhen, setDateWhen] = useState(todayInput());
    const [nbGenMax, setNbGenMax] = useState("");
    const [autoValidate, setAutoValidate] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setTitle(invoiceRef ? `Modèle ${invoiceRef}` : "Modèle récurrent");
        setFrequency("1");
        setUnitFrequency("m");
        setDateWhen(todayInput());
        setNbGenMax("");
        setAutoValidate(false);
        // Only reset when the modal opens.
    }, [open, invoiceRef]);

    if (!open) return null;

    const submit = async () => {
        if (title.trim() === "") {
            toast.error("Renseignez un titre de modèle");
            return;
        }
        setSubmitting(true);
        try {
            const created = await dbInvoiceRecs.createFromInvoice({
                fkFacture: invoiceId,
                title: title.trim(),
                frequency: Number(frequency) || 0,
                unitFrequency,
                dateWhen: dateWhen ? new Date(dateWhen).getTime() : undefined,
                nbGenMax: nbGenMax === "" ? 0 : Number(nbGenMax),
                autoValidate,
            });
            toast.success("Modèle récurrent créé");
            onClose?.();
            if (created?.id) {
                navigate(`/invoice-templates/${created.id}`);
            }
        } catch (err) {
            console.error("createFromInvoice", err);
            toast.error("Création du modèle impossible");
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
                        <FaRepeat className="text-soft-text" />
                        Nouveau modèle récurrent
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
                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Titre du modèle</span>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-soft-text">Fréquence</span>
                            <input type="number" min="0" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls} />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] text-soft-text">Unité</span>
                            <select value={unitFrequency} onChange={(e) => setUnitFrequency(e.target.value)} className={inputCls}>
                                <option value="d">Jour(s)</option>
                                <option value="w">Semaine(s)</option>
                                <option value="m">Mois</option>
                                <option value="y">An(s)</option>
                            </select>
                        </label>
                    </div>
                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Première génération</span>
                        <input type="date" value={dateWhen} onChange={(e) => setDateWhen(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-soft-text">Nombre max de générations (0 = illimité)</span>
                        <input type="number" min="0" value={nbGenMax} onChange={(e) => setNbGenMax(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex items-center gap-2 text-[12px] text-strong-text">
                        <input type="checkbox" checked={autoValidate} onChange={(e) => setAutoValidate(e.target.checked)} />
                        <span>Valider automatiquement les factures générées</span>
                    </label>
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
                        disabled={submitting}
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <FaRepeat className="text-[11px]" />
                        <span>Créer le modèle</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};
