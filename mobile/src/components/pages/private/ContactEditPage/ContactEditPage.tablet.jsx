import { TabletEditScaffold } from "src/lib/tablet";

// Tablet edit page for a Contact: focused full-page form (touch header +
// catalogue-driven AutoForm laid out in two columns). Reuses the shared
// useContactEditData() data hook (load / save / cancel / describe).
//
// excludeKeys mirror the desktop edit view (computed / system-managed fields).
const EXCLUDE_KEYS = [
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
];

const formatName = (c) =>
    c ? [c.firstname, c.lastname].filter(Boolean).join(" ").trim() : "";

export const ContactEditPageTablet = ({
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
    return (
        <TabletEditScaffold
            title={isNew ? "Nouveau contact" : `Modifier ${formatName(contact)}`}
            loading={loading}
            saving={saving}
            error={error}
            describe={describe}
            value={initialValues}
            mode={isNew ? "create" : "update"}
            excludeKeys={EXCLUDE_KEYS}
            onCancel={cancel}
            onSave={save}
        />
    );
};
