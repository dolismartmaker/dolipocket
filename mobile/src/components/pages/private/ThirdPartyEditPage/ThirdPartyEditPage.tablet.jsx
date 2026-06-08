import { TabletEditScaffold } from "src/lib/tablet";

// Tablet edit page for a ThirdParty: focused full-page form (touch header +
// catalogue-driven AutoForm laid out in two columns). Reuses the shared
// useThirdPartyEditData() data hook (load / save / cancel / describe).
//
// excludeKeys mirror the desktop edit view (computed / system-managed fields).
const EXCLUDE_KEYS = [
    "ref",
    "datec",
    "tms",
    "fkUserAuthor",
    "fkUserModif",
    "logo",
    "lastSearch",
    "lastMainDoc",
    "modelPdf",
    "importKey",
    "datemodification",
    "datecreation",
];

export const ThirdPartyEditPageTablet = ({
    isNew,
    thirdParty,
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
            title={isNew ? "Nouveau tiers" : `Modifier ${thirdParty?.name ?? ""}`}
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
