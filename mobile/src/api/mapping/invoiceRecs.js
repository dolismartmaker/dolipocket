// Mapping backend (Dolibarr FactureRec) <-> front (Dolipocket UI).
//
// Recurring invoice template. The backend dmInvoiceRec mapper emits snake_case
// keys; the schema keys below are snake_case and the produced front keys are
// camelCase. A template is created from an existing invoice (fk_facture); its
// lines come from that invoice and are read-only here. Only the recurring
// settings (title, frequency, unit, next date, gen cap, flags, notes) are
// writable.

import { Mapping } from "@cap-rel/smartcommon";

const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0, readOnly: true },
    product_ref:    { key: "productRef",    type: "string", default: "", readOnly: true },
    product_type:   { key: "productType",   type: "int",    default: 0, readOnly: true },
    label:          { key: "label",         type: "string", default: "", readOnly: true },
    description:    { key: "description",   type: "string", default: "", readOnly: true },
    qty:            { key: "qty",           type: "float",  default: 0, readOnly: true },
    subprice:       { key: "subprice",      type: "float",  default: 0, readOnly: true },
    tva_tx:         { key: "tvaTx",         type: "float",  default: 0, readOnly: true },
    remise_percent: { key: "remisePercent", type: "float",  default: 0, readOnly: true },
    total_ht:       { key: "totalHt",       type: "float",  default: 0, readOnly: true },
    total_tva:      { key: "totalTva",      type: "float",  default: 0, readOnly: true },
    total_ttc:      { key: "totalTtc",      type: "float",  default: 0, readOnly: true },
    rang:           { key: "rang",          type: "int",    default: 0, readOnly: true },
};

const schema = {
    id:                { key: "id",              type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:               { key: "ref",             type: "string", default: "", readOnly: true },
    title:             { key: "title",           type: "string", default: "" },
    socid:             { key: "socid",           type: "int",    default: 0, aliases: ["fk_soc"], readOnly: true },
    fk_soc:            { key: "fkSoc",            type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    suspended:         { key: "suspended",       type: "int",    default: 0, readOnly: true },
    frequency:         { key: "frequency",       type: "int",    default: 0 },
    unit_frequency:    { key: "unitFrequency",   type: "string", default: "m" },
    date_when:         { key: "dateWhen",        type: "int",    default: 0 },
    date_last_gen:     { key: "dateLastGen",     type: "int",    default: 0, readOnly: true },
    nb_gen_done:       { key: "nbGenDone",       type: "int",    default: 0, readOnly: true },
    nb_gen_max:        { key: "nbGenMax",        type: "int",    default: 0 },
    auto_validate:     { key: "autoValidate",    type: "int",    default: 0 },
    usenewprice:       { key: "usenewprice",     type: "int",    default: 0 },
    date_creation:     { key: "dateCreation",    type: "int",    default: 0, readOnly: true },
    total_ht:          { key: "totalHt",         type: "float",  default: 0, readOnly: true },
    total_ttc:         { key: "totalTtc",        type: "float",  default: 0, readOnly: true },
    total_tva:         { key: "totalTva",        type: "float",  default: 0, readOnly: true },
    fk_cond_reglement: { key: "fkCondReglement", type: "int",    default: 0, readOnly: true },
    fk_mode_reglement: { key: "fkModeReglement", type: "int",    default: 0, readOnly: true },
    note_public:       { key: "notePublic",      type: "string", default: "" },
    note_private:      { key: "notePrivate",     type: "string", default: "" },
    lines:             { key: "lines",           default: [],    items: lineSchema, readOnly: true },
};

export const invoiceRecLineMapping = new Mapping({ schema: lineSchema, strict: true });

export const invoiceRecMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return invoiceRecLineMapping.map(raw);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return invoiceRecMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return invoiceRecMapping.reverse(local);
};
