// Mapping backend (Dolibarr FactureFournisseur) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid, socid <- socid|fk_soc)
//   - writeFrom : fallback a l'ecriture sur une autre cle front (socid <- fkSoc)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref, totaux
//                 calcules, statut, dates calculees, thirdpartyName, paiements)
//   - items     : schema applique a chaque element d'un tableau (lines, payments)
//
// On conserve mapFromBackend/mapToBackend (+ mapLineFromBackend/mapLineToBackend
// + mapPaymentFromBackend) comme interface publique : les hooks useDb<Feature>
// les consomment. Les lignes sont retournees avec le header en lecture ET
// renvoyees au serveur a la creation (l'ancien mapToBackend recopiait
// local.lines) -- l'entree `lines` n'est donc PAS readOnly, contrairement aux
// paiements qui restent en lecture seule.

import { Mapping } from "@cap-rel/smartcommon";

// --- Lignes de facture fournisseur -------------------------------------------

const lineSchema = {
    id:               { key: "id",             type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_facture_fourn: { key: "fkFactureFourn", type: "int",    default: 0, readOnly: true },
    fk_product:       { key: "fkProduct",      type: "int",    default: 0 },
    ref:              { key: "ref",            type: "string", default: "" },
    label:            { key: "label",          type: "string", default: "" },
    description:      { key: "description",    type: "string", default: "" },
    qty:              { key: "qty",            type: "float",  default: 0 },
    tva_tx:           { key: "tvaTx",          type: "float",  default: 0 },
    subprice:         { key: "subprice",       type: "float",  default: 0 },
    remise_percent:   { key: "remisePercent",  type: "float",  default: 0 },
    total_ht:         { key: "totalHt",        type: "float",  default: 0, readOnly: true },
    total_ttc:        { key: "totalTtc",       type: "float",  default: 0, readOnly: true },
    rang:             { key: "rang",           type: "int",    default: 0 },
    product_type:     { key: "productType",    type: "int",    default: 0 },
    // Section lines (Lot 11) : product_type=9 + special_code=0 -> titre,
    // product_type=9 + special_code=104 -> sous-total. Lu ET ecrit.
    special_code:     { key: "specialCode",    type: "int",    default: 0 },
};

export const supplierInvoiceLineMapping = new Mapping({ schema: lineSchema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierInvoiceLineMapping.map(raw);
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierInvoiceLineMapping.reverse(local);
};

// --- Paiements (lecture seule) ------------------------------------------------
// Backend shape: { id, date, amount, mode_code, mode_label }.

const paymentSchema = {
    id:         { key: "id",        type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    date:       { key: "date",      type: "int",    default: 0,                     readOnly: true },
    amount:     { key: "amount",    type: "float",  default: 0,                     readOnly: true },
    mode_code:  { key: "modeCode",  type: "string", default: "", aliases: ["modeCode"],  readOnly: true },
    mode_label: { key: "modeLabel", type: "string", default: "", aliases: ["modeLabel"], readOnly: true },
};

export const supplierInvoicePaymentMapping = new Mapping({ schema: paymentSchema, strict: true });

export const mapPaymentFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierInvoicePaymentMapping.map(raw);
};

// --- En-tete facture fournisseur ----------------------------------------------

const schema = {
    id:                 { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",               type: "string", default: "",                    readOnly: true },
    ref_supplier:       { key: "refSupplier",       type: "string", default: "" },
    // socid is the writable canonical FK ; the legacy mapToBackend wrote a single
    // `socid` key sourced from local.socid ?? local.fkSoc -> writeFrom:["fkSoc"].
    socid:              { key: "socid",             type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    // fkSoc is exposed in read (socid ?? fk_soc) but the legacy mapToBackend never
    // wrote an fk_soc key -> readOnly on the write side.
    fk_soc:             { key: "fkSoc",             type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    type:               { key: "type",              type: "int",    default: 0 },
    datef:              { key: "datef",             type: "int",    default: 0 },
    date_lim_reglement: { key: "dateLimReglement",  type: "int",    default: 0 },
    total_ht:           { key: "totalHt",           type: "float",  default: 0, readOnly: true },
    total_ttc:          { key: "totalTtc",          type: "float",  default: 0, readOnly: true },
    total_tva:          { key: "totalTva",          type: "float",  default: 0, readOnly: true },
    paye:               { key: "paye",              type: "int",    default: 0, readOnly: true },
    statut:             { key: "statut",            type: "int",    default: 0, readOnly: true },
    note_public:        { key: "notePublic",        type: "string", default: "" },
    note_private:       { key: "notePrivate",       type: "string", default: "" },
    fk_cond_reglement:  { key: "fkCondReglement",   type: "int",    default: 0 },
    fk_mode_reglement:  { key: "fkModeReglement",   type: "int",    default: 0 },
    libelle:            { key: "libelle",           type: "string", default: "" },
    thirdparty_name:    { key: "thirdpartyName",    type: "string", default: "", readOnly: true },
    // Last generated PDF (relative path under DOL_DATA_ROOT), affiche/telecharge
    // par l'UI. Lu seulement (l'ancien mapToBackend ne l'emettait pas).
    last_main_doc:      { key: "lastMainDoc",       type: "string", default: "", readOnly: true },
    socname:            { key: "socname",           type: "string", default: "", readOnly: true },
    socEmail:           { key: "socEmail",          type: "string", default: "", readOnly: true },
    // Lines are read AND written back, but ONLY when present as an array (the
    // legacy mapToBackend gated on Array.isArray) -> omitEmpty, not readOnly.
    lines:              { key: "lines",             default: [], items: lineSchema, omitEmpty: true },
    // Read-only payments recap exposed by SupplierInvoiceController::show().
    payments:           { key: "payments",          default: [], items: paymentSchema, readOnly: true },
    total_paid:         { key: "totalPaid",          type: "float",  default: 0, readOnly: true },
    remain_to_pay:      { key: "remainToPay",        type: "float",  default: 0, readOnly: true },
    tms:                { key: "updatedAt",          type: "int",    default: 0, readOnly: true },
};

export const supplierInvoiceMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierInvoiceMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierInvoiceMapping.reverse(local);
};
