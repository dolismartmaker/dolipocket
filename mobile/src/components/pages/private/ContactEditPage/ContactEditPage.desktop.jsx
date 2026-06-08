import { useRef } from "react";
import { FaArrowLeft, FaFloppyDisk, FaXmark } from "react-icons/fa6";

import { AutoForm } from "src/lib/forms/AutoForm";

// Desktop edit page for a Contact. Renders a single AutoForm generated
// from the backend describe() catalog. No JSX is hardcoded per field.
// Conventions UI épurées strictes (cf .claude/CLAUDE.md): pas de shadow-sm,
// pas de rounded-2xl, density tight, pas de transition-all.
export const ContactEditPageDesktop = ({
    isNew,
    contact,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
}) => {
    // Live values from AutoForm. We collect them via onChange and submit via
    // a ref so the header buttons can trigger save() without a wrapping form.
    const valuesRef = useRef(initialValues || {});

    const handleSave = () => {
        save(valuesRef.current).then(() => undefined);
    };

    const fullName = contact
        ? [contact.firstname, contact.lastname].filter(Boolean).join(" ").trim()
        : "";

    return (
        <div className="flex flex-col h-full w-full bg-soft-bg overflow-hidden">
            {/* Header sticky */}
            <header className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-b border-soft-border">
                <button
                    type="button"
                    onClick={cancel}
                    className="p-2 -ml-2 rounded-md hover:bg-medium-bg/50 text-soft-text"
                    aria-label="Retour"
                >
                    <FaArrowLeft />
                </button>
                <h1 className="text-base font-semibold text-strong-text flex-1 truncate">
                    {isNew ? "Nouveau contact" : `Modifier ${fullName}`}
                </h1>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex items-center gap-2 rounded-md border border-soft-border bg-white px-3 py-1.5 text-sm text-strong-text hover:bg-medium-bg/50"
                    disabled={saving}
                >
                    <FaXmark className="text-xs" />
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
                    disabled={saving}
                >
                    <FaFloppyDisk className="text-xs" />
                    {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1200px] mx-auto px-6 py-6">
                    {error ? (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="rounded-md border border-soft-border bg-white p-4 text-sm text-soft-text">
                            Chargement du contact...
                        </div>
                    ) : (
                        <AutoForm
                            describe={describe}
                            value={initialValues}
                            mode={isNew ? "create" : "update"}
                            onChange={(v) => { valuesRef.current = v; }}
                            onSubmit={(v) => { valuesRef.current = v; handleSave(); }}
                            excludeKeys={[
                                // Computed / system-managed
                                "ref",
                                "datec",
                                "tms",
                                "fkUserAuthor",
                                "fkUserModif",
                                "fkUserCreat",
                                "importKey",
                                "datemodification",
                                "datecreation",
                                "lastMainDoc",
                                "modelPdf",
                            ]}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
