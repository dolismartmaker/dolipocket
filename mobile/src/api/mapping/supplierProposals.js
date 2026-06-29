// Mapping backend (Dolibarr SupplierProposal) <-> front (Dolipocket UI).
//
// Supplier-side counterpart of mapping/proposals.js (customer devis). The
// backend dmSupplierProposal mapper emits snake_case keys; the schema keys
// below are snake_case and the produced front keys are camelCase.
//
// A supplier price request is a full document with editable lines (like a
// proposal): mapToBackend emits the writable header fields, mapLineToBackend
// emits the writable line fields consumed by the generic <DocumentLinesEditor>.

import { Mapping } from "@cap-rel/smartcommon";

const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_supplier_proposal: { key: "fkSupplierProposal", type: "int", default: 0, readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0 },
    product_ref:    { key: "productRef",    type: "string", default: "", readOnly: true },
    product_label:  { key: "productLabel",  type: "string", default: "", readOnly: true },
    label:          { key: "label",         type: "string", default: "" },
    description:    { key: "description",   type: "string", default: "" },
    ref_supplier:   { key: "refSupplier",   type: "string", default: "" },
    qty:            { key: "qty",           type: "float",  default: 0 },
    tva_tx:         { key: "tvaTx",         type: "float",  default: 0 },
    subprice:       { key: "subprice",      type: "float",  default: 0 },
    remise_percent: { key: "remisePercent", type: "float",  default: 0 },
    total_ht:       { key: "totalHt",       type: "float",  default: 0, readOnly: true },
    total_tva:      { key: "totalTva",      type: "float",  default: 0, readOnly: true },
    total_ttc:      { key: "totalTtc",      type: "float",  default: 0, readOnly: true },
    rang:           { key: "rang",          type: "int",    default: 0 },
    product_type:   { key: "productType",   type: "int",    default: 0 },
    special_code:   { key: "specialCode",   type: "int",    default: 0 },
};

export const supplierProposalLineMapping = new Mapping({ schema: lineSchema, strict: true });

const schema = {
    id:                 { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",              type: "string", default: "", readOnly: true },
    socid:              { key: "socid",            type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    fk_soc:             { key: "fkSoc",            type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    fk_user_author:     { key: "fkUserAuthor",     type: "int",    default: 0, readOnly: true },
    date_creation:      { key: "dateCreation",     type: "int",    default: 0, readOnly: true },
    date_validation:    { key: "dateValidation",   type: "int",    default: 0, readOnly: true },
    delivery_date:      { key: "deliveryDate",     type: "int",    default: 0 },
    total_ht:           { key: "totalHt",          type: "float",  default: 0, readOnly: true },
    total_ttc:          { key: "totalTtc",         type: "float",  default: 0, readOnly: true },
    total_tva:          { key: "totalTva",         type: "float",  default: 0, readOnly: true },
    remise_percent:     { key: "remisePercent",    type: "float",  default: 0, readOnly: true },
    remise_absolue:     { key: "remiseAbsolue",    type: "float",  default: 0, readOnly: true },
    statut:             { key: "statut",           type: "int",    default: 0, readOnly: true },
    note_public:        { key: "notePublic",       type: "string", default: "" },
    note_private:       { key: "notePrivate",      type: "string", default: "" },
    fk_cond_reglement:  { key: "fkCondReglement",  type: "int",    default: 0 },
    fk_mode_reglement:  { key: "fkModeReglement",  type: "int",    default: 0 },
    last_main_doc:      { key: "lastMainDoc",      type: "string", default: "", readOnly: true },
    socname:            { key: "socname",          type: "string", default: "", readOnly: true },
    socEmail:           { key: "socEmail",         type: "string", default: "", readOnly: true },
    lines:              { key: "lines",            default: [],    items: lineSchema, readOnly: true },
};

export const supplierProposalMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierProposalLineMapping.map(raw);
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierProposalLineMapping.reverse(local);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierProposalMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierProposalMapping.reverse(local);
};
