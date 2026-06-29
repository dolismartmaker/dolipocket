import { useRef } from "react";
import { FaArrowLeft, FaFloppyDisk, FaXmark } from "react-icons/fa6";

import { AutoForm } from "src/lib/forms/AutoForm";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

// Desktop edit page for an Invoice.
//
// Field curation: instead of dumping the whole Dolibarr Facture catalog (~30
// fields, many internal: type, fk_facture_source, fk_user_closing,
// date_closing...), the form is whitelisted to the fields a user actually
// edits -- mirroring the mapper's $writableFields (cf dmInvoice.php). Internal
// fields can no longer leak in (a blacklist would have to chase each one).
//
// Layout: the LINES are the priority. On an existing invoice the editable lines
// take 2/3 on the left and the header form sits in a 1/3 rail on the right
// (single-column so the narrow width stays readable). On creation there are no
// lines yet (create redirects to the detail page to add them), so the form is
// shown centered full width.
//
// Conventions UI épurées strictes (cf .claude/CLAUDE.md): pas de shadow-sm,
// pas de rounded-2xl, density tight, pas de transition-all.

// Editable header fields, aligned with dmInvoice::$writableFields. On creation
// the client (fk_soc) is required and editable; on update it is fixed (Dolibarr
// does not let you re-assign a posted invoice's thirdparty) so it drops out.
const HEADER_KEYS_CREATE = [
    "fk_soc", "ref_client", "datef", "fk_cond_reglement", "fk_mode_reglement",
    "note_public", "note_private",
];
const HEADER_KEYS_UPDATE = [
    "ref_client", "datef", "date_lim_reglement", "fk_cond_reglement", "fk_mode_reglement",
    "note_public", "note_private",
];

export const InvoiceEditPageDesktop = ({
    isNew,
    invoice,
    setInvoice,
    loading,
    saving,
    error,
    initialValues,
    describe,
    save,
    cancel,
    dbInvoices,
}) => {
    // Live values from AutoForm. We collect them via onChange and submit via
    // a ref so the header buttons can trigger save() without a wrapping form.
    const valuesRef = useRef(initialValues || {});

    const handleSave = () => {
        save(valuesRef.current).then(() => undefined);
    };

    const includeKeys = isNew ? HEADER_KEYS_CREATE : HEADER_KEYS_UPDATE;
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
            {/* Header sticky */}
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
                    {isNew ? "Nouvelle facture" : `Modifier ${invoice?.ref ?? ""}`}
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

            {/* Body */}
            <div className="flex-1 overflow-auto px-4 py-4">
                {error ? (
                    <div className="mb-4 max-w-[1500px] mx-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="max-w-[1500px] mx-auto rounded-md border border-soft-border bg-white p-4 text-sm text-soft-text">
                        Chargement de la facture...
                    </div>
                ) : isNew ? (
                    // Creation: no lines yet, centered header form.
                    <div className="max-w-[760px] mx-auto">
                        {form}
                    </div>
                ) : (
                    // Existing invoice: lines (2/3) + header rail (1/3).
                    <div className="flex gap-4 max-w-[1500px] mx-auto">
                        <main className="flex-1 min-w-0">
                            <DocumentLinesEditor
                                docId={invoice ? Number(invoice.id) : 0}
                                lines={invoice?.lines ?? []}
                                dataSource={dbInvoices}
                                onChange={(updatedDoc) => {
                                    if (typeof setInvoice === "function" && updatedDoc) {
                                        setInvoice(updatedDoc);
                                    }
                                }}
                                readOnly={!!invoice && invoice.statut !== 0}
                            />
                        </main>
                        <aside className="w-[360px] shrink-0 sticky top-0 self-start">
                            {form}
                        </aside>
                    </div>
                )}
            </div>
        </div>
    );
};
