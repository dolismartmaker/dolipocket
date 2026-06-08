import { TabletEditScaffold } from "src/lib/tablet";

// Tablet edit page for a Product: focused full-page form (touch header +
// catalogue-driven AutoForm laid out in two columns). Reuses the shared
// useProductEditData() data hook (load / save / cancel / describe).
//
// excludeKeys mirror the desktop edit view (computed / system-managed and
// read-only stock counter fields).
const EXCLUDE_KEYS = [
    // Computed / system-managed
    "datec",
    "tms",
    "fkUserAuthor",
    "fkUserModif",
    "fkUserCreat",
    // Stock counters are read-only here
    "stockReel",
    "stockTheorique",
    "pmp",
    "seuilStockAlerte",
    // Other system fields
    "importKey",
    "datemodification",
    "datecreation",
    "lastMainDoc",
    "modelPdf",
];

export const ProductEditPageTablet = ({
    isNew,
    product,
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
            title={isNew ? "Nouveau produit" : `Modifier ${product?.ref ?? ""}`}
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
