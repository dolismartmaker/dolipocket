import { useEffect, useRef, useState } from "react";
import { FaCheck, FaXmark } from "react-icons/fa6";

const INPUT_CLASS =
    "h-[28px] w-full px-2 rounded border border-primary/60 text-[13px] text-strong-text bg-white focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60";

// Inline editor for a single header field. Enter saves (except textarea),
// Escape cancels; explicit check/cancel buttons are always available. On a save
// failure the editor stays open and shows the error so nothing is lost.
//
// Props:
//   kind         editor kind from editorKindForType (text/textarea/number/...).
//   initialValue raw current value of the field.
//   onSave       async (value) => ... ; resolves on success (parent closes the
//                editor), rejects on failure (editor shows the error).
//   onCancel     () => ... ; closes the editor without saving.
export const InlineFieldEditor = ({ kind, initialValue, onSave, onCancel }) => {
    const [value, setValue] = useState(
        initialValue === null || initialValue === undefined ? "" : String(initialValue),
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        if (typeof el.select === "function") el.select();
    }, []);

    const commit = async () => {
        if (saving) return;
        setSaving(true);
        setError(null);
        try {
            await onSave(value);
            // On success the parent clears the editing key and unmounts us.
        } catch (err) {
            console.error("[InlineFieldEditor] save error", err);
            setError("Échec de l'enregistrement");
            setSaving(false);
        }
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" && kind !== "textarea") {
            e.preventDefault();
            commit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
        }
    };

    const control = kind === "textarea" ? (
        <textarea
            ref={ref}
            value={value}
            disabled={saving}
            rows={3}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className={`${INPUT_CLASS} h-auto py-1 resize-y`}
        />
    ) : kind === "boolean" ? (
        <select
            ref={ref}
            value={value === "1" || value === "true" ? "1" : "0"}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className={INPUT_CLASS}
        >
            <option value="1">Oui</option>
            <option value="0">Non</option>
        </select>
    ) : (
        <input
            ref={ref}
            type={kind === "number" ? "number" : kind === "email" ? "email" : kind === "tel" ? "tel" : kind === "url" ? "url" : "text"}
            inputMode={kind === "number" ? "decimal" : undefined}
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            className={INPUT_CLASS}
        />
    );

    return (
        <div className="w-full flex flex-col gap-1">
            <div className="flex items-start gap-1">
                <div className="flex-1 min-w-0">{control}</div>
                <button
                    type="button"
                    onClick={commit}
                    disabled={saving}
                    className="h-[28px] w-[28px] shrink-0 flex items-center justify-center rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    aria-label="Enregistrer"
                    title="Enregistrer (Entrée)"
                >
                    <FaCheck className="text-[11px]" />
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="h-[28px] w-[28px] shrink-0 flex items-center justify-center rounded bg-white border border-soft-border text-soft-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Annuler"
                    title="Annuler (Échap)"
                >
                    <FaXmark className="text-[11px]" />
                </button>
            </div>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
    );
};
