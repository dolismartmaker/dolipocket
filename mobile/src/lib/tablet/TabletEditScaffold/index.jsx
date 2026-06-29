import { useRef } from "react";
import { FaArrowLeft, FaFloppyDisk, FaXmark } from "react-icons/fa6";

import { AutoForm } from "src/lib/forms/AutoForm";

// Focused full-page edit scaffold for the tablet viewport.
//
// Renders a touch header (back + title + cancel + save, buttons >= 44px) and a
// catalogue-driven <AutoForm> (which lays out two columns on tablet). For the
// five document features, pass `renderLines` to append a <DocumentLinesEditor>
// block under the form. The AutoForm values are collected via a ref so the
// sticky header buttons can submit without a wrapping <form>.
//
//   <TabletEditScaffold
//       title={isNew ? "Nouveau tiers" : `Modifier ${name}`}
//       loading={loading} saving={saving} error={error}
//       describe={describe} value={initialValues}
//       mode={isNew ? "create" : "update"}
//       excludeKeys={[...]} includeKeys={[...]} overrides={...} groupings={...}
//       onCancel={cancel} onSave={save}            // save(values) => Promise
//       renderLines={() => <DocumentLinesEditor ... />}   // optional
//   />
export const TabletEditScaffold = ({
    title,
    loading,
    saving,
    error,
    describe,
    value,
    mode = "create",
    excludeKeys,
    includeKeys,
    overrides,
    groupings,
    onCancel,
    onSave,
    renderLines,
}) => {
    const valuesRef = useRef(value || {});

    const handleSave = () => {
        Promise.resolve(onSave?.(valuesRef.current)).catch(() => undefined);
    };

    return (
        <div className="min-h-full bg-medium-bg">
            <header className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-white border-b border-soft-border">
                <button
                    type="button"
                    onClick={onCancel}
                    className="w-11 h-11 -ml-1 rounded-lg flex items-center justify-center text-soft-text active:bg-medium-bg"
                    aria-label="Retour"
                >
                    <FaArrowLeft />
                </button>
                <h1 className="text-base font-bold text-strong-text flex-1 truncate">{title}</h1>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="h-11 px-4 rounded-lg border border-soft-border bg-white text-sm font-medium text-strong-text flex items-center gap-2 disabled:opacity-60"
                >
                    <FaXmark className="text-xs" />
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-11 px-4 rounded-lg bg-primary text-white text-sm font-semibold flex items-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                    <FaFloppyDisk className="text-xs" />
                    {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
            </header>

            <div className="p-4 max-w-5xl mx-auto">
                {error ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="rounded-xl border border-soft-border bg-white p-4 text-sm text-soft-text">
                        Chargement...
                    </div>
                ) : (
                    <>
                        <AutoForm
                            describe={describe}
                            value={value}
                            mode={mode}
                            excludeKeys={excludeKeys}
                            includeKeys={includeKeys}
                            overrides={overrides}
                            groupings={groupings}
                            onChange={(v) => { valuesRef.current = v; }}
                            onSubmit={(v) => { valuesRef.current = v; handleSave(); }}
                        />
                        {typeof renderLines === "function" ? (
                            <div className="mt-4">{renderLines()}</div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
};
