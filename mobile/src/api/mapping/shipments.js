// Mapping backend (Dolibarr Expedition) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13): the field correspondence
// is declared once in a smartcommon `Mapping` schema, which derives both
// directions. The backend dmShipment mapper emits snake_case keys (the LEFT
// side of $listOfPublishedFields), so the schema keys below are snake_case and
// the produced front keys are camelCase.
//
// A shipment is created from an order via a custom payload (origin_id + lines
// of {entrepot_id, fk_origin_line, qty}); that payload is built by the store,
// not by this mapping. Only the editable header fields (refCustomer,
// dateDelivery, trackingNumber, shippingMethodId, notes) are writable here --
// everything else is readOnly so mapToBackend() never re-sends computed values.

import { Mapping } from "@cap-rel/smartcommon";

const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_origin_line: { key: "fkOriginLine",  type: "int",    default: 0, readOnly: true },
    fk_expedition:  { key: "fkExpedition",  type: "int",    default: 0, readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0, readOnly: true },
    product_ref:    { key: "productRef",    type: "string", default: "", readOnly: true },
    product_label:  { key: "productLabel",  type: "string", default: "", readOnly: true },
    product_type:   { key: "productType",   type: "int",    default: 0, readOnly: true },
    label:          { key: "label",         type: "string", default: "", readOnly: true },
    description:    { key: "description",   type: "string", default: "", readOnly: true },
    qty_asked:      { key: "qtyAsked",      type: "float",  default: 0, readOnly: true },
    qty_shipped:    { key: "qtyShipped",    type: "float",  default: 0, readOnly: true },
    qty:            { key: "qty",           type: "float",  default: 0, readOnly: true },
    entrepot_id:    { key: "entrepotId",    type: "int",    default: 0, readOnly: true },
    rang:           { key: "rang",          type: "int",    default: 0, readOnly: true },
    subprice:       { key: "subprice",      type: "float",  default: 0, readOnly: true },
    tva_tx:         { key: "tvaTx",         type: "float",  default: 0, readOnly: true },
    remise_percent: { key: "remisePercent", type: "float",  default: 0, readOnly: true },
    total_ht:       { key: "totalHt",       type: "float",  default: 0, readOnly: true },
    total_tva:      { key: "totalTva",      type: "float",  default: 0, readOnly: true },
    total_ttc:      { key: "totalTtc",      type: "float",  default: 0, readOnly: true },
};

const schema = {
    id:                 { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",              type: "string", default: "", readOnly: true },
    ref_customer:       { key: "refCustomer",      type: "string", default: "" },
    socid:              { key: "socid",            type: "int",    default: 0, aliases: ["fk_soc"], readOnly: true },
    fk_soc:             { key: "fkSoc",            type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    origin:             { key: "origin",           type: "string", default: "", readOnly: true },
    origin_id:          { key: "originId",         type: "int",    default: 0, readOnly: true },
    date_creation:      { key: "dateCreation",     type: "int",    default: 0, readOnly: true },
    date_valid:         { key: "dateValid",        type: "int",    default: 0, readOnly: true },
    date_expedition:    { key: "dateExpedition",   type: "int",    default: 0, readOnly: true },
    date_delivery:      { key: "dateDelivery",     type: "int",    default: 0 },
    statut:             { key: "statut",           type: "int",    default: 0, readOnly: true },
    billed:             { key: "billed",           type: "int",    default: 0, readOnly: true },
    tracking_number:    { key: "trackingNumber",   type: "string", default: "" },
    tracking_url:       { key: "trackingUrl",      type: "string", default: "", readOnly: true },
    shipping_method_id: { key: "shippingMethodId", type: "int",    default: 0 },
    shipping_method:    { key: "shippingMethod",   type: "string", default: "", readOnly: true },
    weight:             { key: "weight",           type: "float",  default: 0, readOnly: true },
    total_ht:           { key: "totalHt",          type: "float",  default: 0, readOnly: true },
    total_ttc:          { key: "totalTtc",         type: "float",  default: 0, readOnly: true },
    total_tva:          { key: "totalTva",         type: "float",  default: 0, readOnly: true },
    note_public:        { key: "notePublic",       type: "string", default: "" },
    note_private:       { key: "notePrivate",      type: "string", default: "" },
    // Lines are read alongside the header (show()); the reverse never re-sends
    // them (creation uses a dedicated origin_id + lines payload).
    lines:              { key: "lines",            default: [],    items: lineSchema, readOnly: true },
};

export const shipmentLineMapping = new Mapping({ schema: lineSchema, strict: true });

export const shipmentMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return shipmentLineMapping.map(raw);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return shipmentMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return shipmentMapping.reverse(local);
};
