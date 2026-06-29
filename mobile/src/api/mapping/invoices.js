// Mapping backend (Dolibarr Facture) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid, socid <-> fk_soc)
//   - writeFrom : ecriture multi-source (fallback sur d'autres cles FRONT,
//                 ex socid ecrit depuis socid|fkSoc)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref, totaux
//                 calcules, statut, dates calculees, lastMainDoc, lines,
//                 payments)
//   - items     : schema applique a chaque element d'un tableau (lines, payments)
//
// On conserve mapFromBackend/mapToBackend (+ mapLineFromBackend/mapLineToBackend
// + mapPaymentFromBackend) comme interface publique : les hooks useDb<Feature>
// les consomment. Les lignes et paiements sont retournes avec le header quand le
// backend les inclut (show()) mais seuls les champs du header sont persistes en
// Dexie (cf useDbInvoices).

import { Mapping } from "@cap-rel/smartcommon";

// --- Lignes de facture --------------------------------------------------------

const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_facture:     { key: "fkFacture",     type: "int",    default: 0, readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0 },
    label:          { key: "label",         type: "string", default: "" },
    description:    { key: "description",   type: "string", default: "" },
    qty:            { key: "qty",           type: "float",  default: 0 },
    tva_tx:         { key: "tvaTx",         type: "float",  default: 0 },
    subprice:       { key: "subprice",      type: "float",  default: 0 },
    remise_percent: { key: "remisePercent", type: "float",  default: 0 },
    total_ht:       { key: "totalHt",       type: "float",  default: 0, readOnly: true },
    total_ttc:      { key: "totalTtc",      type: "float",  default: 0, readOnly: true },
    rang:           { key: "rang",          type: "int",    default: 0 },
    product_type:   { key: "productType",   type: "int",    default: 0 },
    // Section lines (Lot 11). product_type=9 + special_code=0 -> title,
    // product_type=9 + special_code=104 -> sub-total.
    special_code:   { key: "specialCode",   type: "int",    default: 0 },
};

export const invoiceLineMapping = new Mapping({ schema: lineSchema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return invoiceLineMapping.map(raw);
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return invoiceLineMapping.reverse(local);
};

// --- Paiements (lecture seule) ------------------------------------------------

const paymentSchema = {
    id:     { key: "id",     type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:    { key: "ref",    type: "string", default: "",                    readOnly: true },
    amount: { key: "amount", type: "float",  default: 0,                     readOnly: true },
    date:   { key: "date",   type: "int",    default: 0, aliases: ["datep"], readOnly: true },
    type:   { key: "type",   type: "string", default: "",                    readOnly: true },
};

export const invoicePaymentMapping = new Mapping({ schema: paymentSchema, strict: true });

export const mapPaymentFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return invoicePaymentMapping.map(raw);
};

// --- En-tete facture ----------------------------------------------------------

const schema = {
    id:                 { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",               type: "string", default: "",                    readOnly: true },
    ref_client:         { key: "refClient",         type: "string", default: "" },
    // socid/fk_soc : l'ancien mapper exposait DEUX champs front (socid ET fkSoc)
    // et ecrivait DEUX cles serveur (socid ET fk_soc), chacune avec fallback sur
    // l'autre. Reproduit via deux entrees a aliases (lecture) + writeFrom (ecriture).
    socid:              { key: "socid",             type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    fk_soc:             { key: "fkSoc",              type: "int",    default: 0, aliases: ["socid"], writeFrom: ["socid"] },
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
    total_paid:         { key: "totalPaid",         type: "float",  default: 0, readOnly: true },
    remain_to_pay:      { key: "remainToPay",       type: "float",  default: 0, readOnly: true },
    // Last generated PDF (relative path under DOL_DATA_ROOT).
    last_main_doc:      { key: "lastMainDoc",       type: "string", default: "", readOnly: true },
    // Thirdparty name + email (hydrated by show() via fetch_thirdparty) for the
    // detail summary band + default email recipient. Strict mapping requires
    // declaring them or they would be dropped from the payload.
    socname:            { key: "socname",           type: "string", default: "", readOnly: true },
    socEmail:           { key: "socEmail",          type: "string", default: "", readOnly: true },
    lines:              { key: "lines",             default: [], readOnly: true, items: lineSchema },
    payments:           { key: "payments",          default: [], readOnly: true, items: paymentSchema },
};

export const invoiceMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return invoiceMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return invoiceMapping.reverse(local);
};
