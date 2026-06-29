// Mapping backend (Dolibarr CommandeFournisseur) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid, socid <- socid|fk_soc)
//   - writeFrom : fallback a l'ecriture sur une autre cle FRONT (socid <- fkSoc)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref, totaux,
//                 statut, dates calculees, lignes du header, ...)
//   - items     : mappe chaque element du tableau `lines` (lecture seule ici)
//
// On conserve mapFromBackend/mapToBackend/mapLineFromBackend/mapLineToBackend
// comme interface publique (les hooks useDb<Feature> les consomment) ;
// supplierOrderMapping et supplierOrderLineMapping exposent les schemas.

import { Mapping } from "@cap-rel/smartcommon";

// Lignes du document. id / fk_commande / total_* sont lus mais jamais reecrits
// (absents de l'ancien mapLineToBackend).
const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_commande:    { key: "fkCommande",    type: "int",    default: 0, readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0 },
    ref:            { key: "ref",           type: "string", default: "" },
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
    // Section lines : product_type=9 + special_code=0 -> titre,
    // product_type=9 + special_code=104 -> sous-total.
    special_code:   { key: "specialCode",   type: "int",    default: 0 },
};

export const supplierOrderLineMapping = new Mapping({ schema: lineSchema, strict: true });

const schema = {
    id:                { key: "id",              type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:               { key: "ref",             type: "string", default: "", readOnly: true },
    ref_supplier:      { key: "refSupplier",     type: "string", default: "" },
    // socid est lu (socid|fk_soc) ET reecrit (avec fallback front fkSoc).
    // fk_soc / fkSoc est lu (fk_soc|socid) mais jamais reecrit : l'ancien
    // mapToBackend n'emettait que la cle serveur `socid`.
    socid:             { key: "socid",           type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    fk_soc:            { key: "fkSoc",           type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    fk_user_author:    { key: "fkUserAuthor",    type: "int",    default: 0, readOnly: true },
    date_commande:     { key: "dateCommande",    type: "int",    default: 0 },
    date_livraison:    { key: "dateLivraison",   type: "int",    default: 0 },
    total_ht:          { key: "totalHt",         type: "float",  default: 0, readOnly: true },
    total_ttc:         { key: "totalTtc",        type: "float",  default: 0, readOnly: true },
    total_tva:         { key: "totalTva",        type: "float",  default: 0, readOnly: true },
    statut:            { key: "statut",          type: "int",    default: 0, readOnly: true },
    note_public:       { key: "notePublic",      type: "string", default: "" },
    note_private:      { key: "notePrivate",     type: "string", default: "" },
    fk_cond_reglement: { key: "fkCondReglement", type: "int",    default: 0 },
    fk_mode_reglement: { key: "fkModeReglement", type: "int",    default: 0 },
    thirdparty_name:   { key: "thirdpartyName",  type: "string", default: "", readOnly: true },
    // Last generated PDF (relative path under DOL_DATA_ROOT), affiche par l'UI.
    last_main_doc:     { key: "lastMainDoc",     type: "string", default: "", readOnly: true },
    socname:           { key: "socname",         type: "string", default: "", readOnly: true },
    socEmail:          { key: "socEmail",        type: "string", default: "", readOnly: true },
    // Lignes : lues via le line schema. A l'ecriture, l'ancien mapToBackend
    // n'emettait `lines` QUE si c'etait un tableau (flux create d'une commande
    // avec ses lignes en une action) -> omitEmpty (conditionnel, pas de backfill).
    lines:             { key: "lines",           default: [],    items: lineSchema, omitEmpty: true },
    tms:               { key: "updatedAt",       type: "int",    default: 0, readOnly: true },
};

export const supplierOrderMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierOrderLineMapping.map(raw);
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierOrderLineMapping.reverse(local);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return supplierOrderMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return supplierOrderMapping.reverse(local);
};
