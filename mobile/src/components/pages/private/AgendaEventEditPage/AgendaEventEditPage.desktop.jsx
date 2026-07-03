import { useRef } from "react";
import { FaArrowLeft, FaFloppyDisk, FaXmark } from "react-icons/fa6";

import { AutoForm } from "src/lib/forms/AutoForm";

// Curated field set for the agenda event form. Keys are the AutoForm ids
// (camelCase of the mapper appside names). Everything else in the ActionComm
// describe() (fk_element, elementtype, priority, status, ref, system fields)
// is hidden -- the user only sees what actually makes sense to edit.
const AGENDA_INCLUDE_KEYS = [
    "label",
    "typeCode",
    "datep",
    "datef",
    "fulldayevent",
    "location",
    "percentage",
    "note",
    "fkSoc",
    "fkContact",
    "fkProject",
    "fkUserAction",
];

// Per-field presentation overrides: human French labels + the right widgets.
// `typeCode` is already a populated <select> (backend sellist on c_actioncomm).
// `fulldayevent` is an integer in Dolibarr -> force a switch.
const AGENDA_OVERRIDES = {
    label: { label: "Libellé" },
    typeCode: { label: "Type" },
    datep: { label: "Début" },
    datef: { label: "Fin" },
    fulldayevent: { type: "boolean", label: "Journée entière" },
    location: { label: "Lieu" },
    percentage: { label: "Avancement (%)" },
    note: { label: "Description" },
    fkSoc: { label: "Tiers" },
    fkContact: { label: "Contact" },
    fkProject: { label: "Projet" },
    fkUserAction: { label: "Assigné à" },
};

const AGENDA_GROUPINGS = [
    {
        id: "infos",
        title: "Informations",
        keys: ["label", "typeCode", "datep", "datef", "fulldayevent", "location", "percentage"],
    },
    { id: "links", title: "Rattachements", keys: ["fkSoc", "fkContact", "fkProject", "fkUserAction"] },
    { id: "desc", title: "Description", keys: ["note"] },
];

// Desktop edit page for an Agenda event (ActionComm). Renders a single
// AutoForm generated from the backend describe() catalog. No JSX is hardcoded
// per field. Conventions UI épurées strictes (cf .claude/CLAUDE.md): pas de
// shadow-sm, pas de rounded-2xl, density tight, pas de transition-all.
export const AgendaEventEditPageDesktop = ({
    isNew,
    event,
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
                    {isNew ? "Nouvel évènement" : `Modifier ${event?.label ?? ""}`}
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
                            Chargement de l&apos;évènement...
                        </div>
                    ) : (
                        <AutoForm
                            describe={describe}
                            value={initialValues}
                            mode={isNew ? "create" : "update"}
                            onChange={(v) => { valuesRef.current = v; }}
                            onSubmit={(v) => { valuesRef.current = v; handleSave(); }}
                            includeKeys={AGENDA_INCLUDE_KEYS}
                            overrides={AGENDA_OVERRIDES}
                            groupings={AGENDA_GROUPINGS}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
