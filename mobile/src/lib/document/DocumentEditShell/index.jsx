import { useRef } from "react";
import { FaArrowLeft, FaFloppyDisk, FaXmark } from "react-icons/fa6";

import { AutoForm } from "src/lib/forms/AutoForm";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Generic desktop edit shell for the "document with lines" features. Pendant
// of <DocumentDetailShell> for editing: a curated header AutoForm + the lines
// editor, with the lines as the priority.
//
// Field curation comes from config.editFields (create/update whitelists,
// aligned with each mapper's $writableFields) so internal Dolibarr fields
// (type, fk_user_*, internal dates, fk_facture_source...) can never leak into
// the user form -- a blacklist would have to chase each one.
//
// Layout: on an existing document the editable LINES take 2/3 on the left and
// the header form sits in a 1/3 single-column rail (sticky). On creation there
// are no lines yet (create redirects to the detail page to add them), so the
// form is shown centered full width.
//
// The object / setter / dataSource are passed explicitly by the page wrapper
// because the edit hooks name them per feature (order/setOrder/dbOrders,
// invoice/setSupplierInvoice differs from the detail hook, etc.); only the
// generic edit state (isNew/loading/saving/error/describe/save/cancel) is
// uniform across the hooks.
//
// Conventions UI épurées strictes (cf .claude/CLAUDE.md).
export const DocumentEditShell = ({
    config,
    isNew,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
    object,
    setObject,
    dataSource,
}) => {
    // Live values from AutoForm, submitted via a ref so the header buttons can
    // save without a wrapping <form>.
    const valuesRef = useRef(initialValues || {});
    const handleSave = () => { save(valuesRef.current).then(() => undefined); };

    const includeKeys = isNew ? config.editFields.create : config.editFields.update;
    const groupings = [{ id: "main", title: "En-tête", keys: includeKeys }];

    const form = (
        <AutoForm
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            singleColumn={!isNew}
            includeKeys={includeKeys}
            groupings={groupings}
            onChange={(v) => { valuesRef.current = v; }}
            onSubmit={(v) => { valuesRef.current = v; handleSave(); }}
        />
    );

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-soft-border">
                <button
                    type="button"
                    onClick={cancel}
                    className="p-1.5 -ml-1 rounded-md hover:bg-medium-bg text-soft-text hover:text-strong-text transition-colors"
                    aria-label="Retour"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text flex-1 truncate">
                    {isNew ? config.newTitle : `Modifier ${object?.ref ?? ""}`}
                </h1>
                <button
                    type="button"
                    onClick={cancel}
                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    disabled={saving}
                >
                    <FaXmark className="text-[11px]" />
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    disabled={saving}
                >
                    <FaFloppyDisk className="text-[11px]" />
                    {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
            </header>

            <div className="flex-1 overflow-auto px-4 py-4">
                {error ? (
                    <div className="mb-4 max-w-[1500px] mx-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="max-w-[1500px] mx-auto rounded-md border border-soft-border bg-white p-4 text-sm text-soft-text">
                        Chargement...
                    </div>
                ) : isNew ? (
                    <div className="max-w-[760px] mx-auto">{form}</div>
                ) : (
                    <div className="flex gap-4 max-w-[1500px] mx-auto">
                        <main className="flex-1 min-w-0">
                            <DocumentLinesEditor
                                docId={object ? Number(object.id) : 0}
                                lines={object?.lines ?? []}
                                dataSource={dataSource}
                                onChange={(updated) => {
                                    if (typeof setObject === "function" && updated) setObject(updated);
                                }}
                                readOnly={!!object && object.statut !== 0}
                            />
                        </main>
                        <aside className="w-[360px] shrink-0 sticky top-0 self-start">{form}</aside>
                    </div>
                )}
            </div>
        </div>
    );
};
