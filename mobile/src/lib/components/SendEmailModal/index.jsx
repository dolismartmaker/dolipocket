import { useEffect, useRef, useState } from "react";
import { FaXmark, FaPaperPlane, FaPaperclip, FaTriangleExclamation } from "react-icons/fa6";
import toast from "react-hot-toast";

// Reusable "Send by email" modal used by the 5 document detail pages
// (Proposal / Order / Invoice / SupplierOrder / SupplierInvoice).
//
// Props:
//   open                 boolean
//   onClose              () => void
//   onSend               async ({to, subject, body, cc, bcc, attachmentPath}) -> result
//                        The caller (PageDetail) must wire this to
//                        dbXxx.sendEmail(...) which posts to the backend.
//   defaultTo            string (pre-filled, typically the thirdparty email)
//   defaultSubject       string (pre-filled, e.g. "Devis FA2502-0001")
//   defaultBody          string (pre-filled, e.g. "Veuillez trouver ...")
//   defaultAttachment    string (pre-filled, the document's last_main_doc
//                        path -- displayed for transparency, editable so the
//                        user may override).
//   docLabel             string -- shown in the modal title ("Devis", "Facture", ...)
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md): no shadow-sm
// (modals are an explicit exception with shadow-lg), no rounded-2xl,
// border-soft-border for separations, density tight.
export const SendEmailModal = ({
    open,
    onClose,
    onSend,
    defaultTo = "",
    defaultSubject = "",
    defaultBody = "",
    defaultAttachment = "",
    docLabel = "document",
}) => {
    const [to, setTo] = useState(defaultTo);
    const [cc, setCc] = useState("");
    const [bcc, setBcc] = useState("");
    const [subject, setSubject] = useState(defaultSubject);
    const [body, setBody] = useState(defaultBody);
    const [attachment, setAttachment] = useState(defaultAttachment);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const toRef = useRef(null);

    // Whenever the modal is opened, refresh the form from the latest defaults
    // (the document may have been refetched since the last open).
    useEffect(() => {
        if (!open) return;
        setTo(defaultTo || "");
        setCc("");
        setBcc("");
        setSubject(defaultSubject || "");
        setBody(defaultBody || "");
        setAttachment(defaultAttachment || "");
        setShowAdvanced(false);
        setError(null);
        // Focus the recipient field once the modal mounts.
        setTimeout(() => {
            try { toRef.current?.focus?.(); } catch { /* noop */ }
        }, 50);
    }, [open, defaultTo, defaultSubject, defaultBody, defaultAttachment]);

    if (!open) return null;

    const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

    const validate = () => {
        if (!to.trim()) {
            return "L'adresse du destinataire est obligatoire.";
        }
        if (!isValidEmail(to)) {
            return "L'adresse du destinataire est invalide.";
        }
        // CC / BCC may be a CSV of emails.
        for (const kind of [["Cc", cc], ["Cci", bcc]]) {
            const [label, raw] = kind;
            if (!raw.trim()) continue;
            for (const piece of raw.split(",")) {
                const t = piece.trim();
                if (t === "") continue;
                if (!isValidEmail(t)) {
                    return `Adresse ${label} invalide : ${t}`;
                }
            }
        }
        if (!subject.trim()) {
            return "Le sujet est obligatoire.";
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
            await onSend({
                to: to.trim(),
                cc: cc.trim(),
                bcc: bcc.trim(),
                subject: subject.trim(),
                body,
                attachmentPath: attachment.trim() || undefined,
            });
            toast.success(`Email envoyé à ${to.trim()}`);
            onClose?.();
        } catch (err) {
            console.error("SendEmailModal onSend error", err);
            const msg = err?.message || "Erreur lors de l'envoi de l'email";
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
            aria-labelledby="sendemail-modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={submitting ? undefined : onClose}
            />

            {/* Modal panel */}
            <form
                onSubmit={handleSubmit}
                className="relative bg-white w-full sm:max-w-xl sm:rounded-xl rounded-t-xl max-h-[90vh] flex flex-col shadow-lg"
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border">
                    <div className="flex items-center gap-2">
                        <FaPaperPlane className="text-primary text-sm" />
                        <h2
                            id="sendemail-modal-title"
                            className="text-sm font-semibold text-strong-text"
                        >
                            Envoyer le {docLabel} par email
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
                        <label className="block text-xs font-medium text-soft-text">À</label>
                        <input
                            ref={toRef}
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            disabled={submitting}
                            placeholder="destinataire@exemple.com"
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                            required
                        />
                    </div>

                    <div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="text-[12px] text-primary hover:underline"
                        >
                            {showAdvanced ? "Masquer Cc / Cci" : "Ajouter Cc / Cci"}
                        </button>
                    </div>

                    {showAdvanced && (
                        <>
                            <div className="space-y-1">
                                <label className="block text-xs font-medium text-soft-text">Cc</label>
                                <input
                                    type="text"
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    disabled={submitting}
                                    placeholder="manager@exemple.com, autre@exemple.com"
                                    className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs font-medium text-soft-text">Cci</label>
                                <input
                                    type="text"
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                    disabled={submitting}
                                    placeholder="archives@exemple.com"
                                    className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                                />
                            </div>
                        </>
                    )}

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">Sujet</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={submitting}
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text">Corps du message</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            disabled={submitting}
                            rows={6}
                            className="w-full p-3 border border-soft-border rounded-md text-[13px] focus:border-primary focus:outline-hidden disabled:bg-medium-bg font-mono resize-y"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-soft-text flex items-center gap-1">
                            <FaPaperclip className="text-[11px]" />
                            Pièce jointe (chemin du PDF)
                        </label>
                        <input
                            type="text"
                            value={attachment}
                            onChange={(e) => setAttachment(e.target.value)}
                            disabled={submitting}
                            placeholder="Laisser vide pour utiliser le dernier PDF généré"
                            className="w-full h-9 px-3 border border-soft-border rounded-md text-[12px] font-mono text-soft-text focus:border-primary focus:outline-hidden disabled:bg-medium-bg"
                        />
                        <p className="text-[11px] text-soft-text">
                            Si laissé vide, le dernier PDF généré sera utilisé (ou un nouveau sera généré).
                        </p>
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
                        className="h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <FaPaperPlane className="text-[11px]" />
                        <span>{submitting ? "Envoi..." : "Envoyer"}</span>
                    </button>
                </footer>
            </form>
        </div>
    );
};
