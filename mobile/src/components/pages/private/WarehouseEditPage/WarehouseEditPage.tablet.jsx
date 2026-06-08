import { TabletEditScaffold } from "src/lib/tablet";

// Tablet edit page for a Warehouse: focused full-page form (touch header +
// catalogue-driven AutoForm laid out in two columns). Reuses the shared
// useWarehouseEditData() data hook (load / save / cancel / describe).
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

export const WarehouseEditPageTablet = ({
    isNew,
    warehouse,
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
            title={isNew ? "Nouvel entrepôt" : `Modifier ${warehouse?.label ?? warehouse?.ref ?? ""}`}
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
