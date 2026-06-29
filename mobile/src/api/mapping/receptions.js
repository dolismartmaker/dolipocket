// Mapping backend (Dolibarr Reception) <-> front (Dolipocket UI).
//
// Supplier-side analog of mapping/shipments.js. The backend dmReception mapper
// emits snake_case keys, so the schema keys below are snake_case and the
// produced front keys are camelCase.
//
// A reception is created from a supplier order via a custom payload (origin_id
// + lines of {entrepot_id, fk_commandefourndet, qty, cost_price?}); that
// payload is built by the store, not by this mapping. Only the editable header
// fields (refSupplier, dateDelivery, trackingNumber, shippingMethodId, notes)
// are writable here -- everything else is readOnly.

import { Mapping } from "@cap-rel/smartcommon";

const lineSchema = {
    id:                   { key: "id",                  type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_commandefourndet:  { key: "fkCommandefourndet",  type: "int",    default: 0, readOnly: true },
    fk_commande:          { key: "fkCommande",          type: "int",    default: 0, readOnly: true },
    fk_reception:         { key: "fkReception",         type: "int",    default: 0, readOnly: true },
    fk_product:           { key: "fkProduct",           type: "int",    default: 0, readOnly: true },
    entrepot_id:          { key: "entrepotId",          type: "int",    default: 0, readOnly: true },
    label:                { key: "label",               type: "string", default: "", readOnly: true },
    description:          { key: "description",         type: "string", default: "", readOnly: true },
    ref_supplier:         { key: "refSupplier",         type: "string", default: "", readOnly: true },
    qty_asked:            { key: "qtyAsked",            type: "float",  default: 0, readOnly: true },
    qty:                  { key: "qty",                 type: "float",  default: 0, readOnly: true },
    subprice:             { key: "subprice",            type: "float",  default: 0, readOnly: true },
    tva_tx:               { key: "tvaTx",               type: "float",  default: 0, readOnly: true },
    remise_percent:       { key: "remisePercent",       type: "float",  default: 0, readOnly: true },
    total_ht:             { key: "totalHt",             type: "float",  default: 0, readOnly: true },
    total_tva:            { key: "totalTva",            type: "float",  default: 0, readOnly: true },
    total_ttc:            { key: "totalTtc",            type: "float",  default: 0, readOnly: true },
    batch:                { key: "batch",               type: "string", default: "", readOnly: true },
    eatby:                { key: "eatby",               type: "int",    default: 0, readOnly: true },
    sellby:               { key: "sellby",              type: "int",    default: 0, readOnly: true },
    cost_price:           { key: "costPrice",           type: "float",  default: 0, readOnly: true },
    comment:              { key: "comment",             type: "string", default: "", readOnly: true },
    status:               { key: "status",              type: "int",    default: 0, readOnly: true },
};

const schema = {
    id:                 { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",              type: "string", default: "", readOnly: true },
    ref_supplier:       { key: "refSupplier",      type: "string", default: "" },
    socid:              { key: "socid",            type: "int",    default: 0, aliases: ["fk_soc"], readOnly: true },
    fk_soc:             { key: "fkSoc",            type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    origin:             { key: "origin",           type: "string", default: "", readOnly: true },
    origin_id:          { key: "originId",         type: "int",    default: 0, readOnly: true },
    date_creation:      { key: "dateCreation",     type: "int",    default: 0, readOnly: true },
    date_reception:     { key: "dateReception",    type: "int",    default: 0, readOnly: true },
    date_delivery:      { key: "dateDelivery",     type: "int",    default: 0 },
    statut:             { key: "statut",           type: "int",    default: 0, readOnly: true },
    billed:             { key: "billed",           type: "int",    default: 0, readOnly: true },
    tracking_number:    { key: "trackingNumber",   type: "string", default: "" },
    tracking_url:       { key: "trackingUrl",      type: "string", default: "", readOnly: true },
    shipping_method_id: { key: "shippingMethodId", type: "int",    default: 0 },
    weight:             { key: "weight",           type: "float",  default: 0, readOnly: true },
    total_ht:           { key: "totalHt",          type: "float",  default: 0, readOnly: true },
    total_ttc:          { key: "totalTtc",         type: "float",  default: 0, readOnly: true },
    total_tva:          { key: "totalTva",         type: "float",  default: 0, readOnly: true },
    note_public:        { key: "notePublic",       type: "string", default: "" },
    note_private:       { key: "notePrivate",      type: "string", default: "" },
    lines:              { key: "lines",            default: [],    items: lineSchema, readOnly: true },
};

export const receptionLineMapping = new Mapping({ schema: lineSchema, strict: true });

export const receptionMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return receptionLineMapping.map(raw);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return receptionMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return receptionMapping.reverse(local);
};
