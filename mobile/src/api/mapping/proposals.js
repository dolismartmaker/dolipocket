// Mapping backend (Dolibarr Propal) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr manuels)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source cote SERVEUR (id <- id|rowid, socid <- socid|fk_soc)
//   - writeFrom : ecriture multi-source cote FRONT (socid <- socid|fkSoc)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref, totaux, statut, lignes)
//   - items     : schema applique a chaque element d'un tableau (lignes)
//
// On conserve mapFromBackend/mapToBackend ET mapLineFromBackend/mapLineToBackend
// comme interface publique (les hooks useDb<Feature> les consomment) ;
// proposalMapping/proposalLineMapping sont exportes pour l'acces direct au schema.
//
// La redondance socid/fk_soc reproduit l'ancien comportement : mapFromBackend
// emettait DEUX champs front (socid via socid??fk_soc, fkSoc via fk_soc??socid)
// et mapToBackend ecrivait DEUX cles serveur (socid via socid??fkSoc, fk_soc via
// fkSoc??socid). On utilise deux entrees aliases+writeFrom (pas alsoWrite).
//
// Les lignes sont retournees avec l'en-tete quand le backend les inclut (show())
// mais seul l'en-tete est persiste dans Dexie : l'entree `lines` est readOnly,
// exactement comme l'ancien mapToBackend qui ne renvoyait pas lines.

import { Mapping } from "@cap-rel/smartcommon";

const lineSchema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_propal:      { key: "fkPropal",      type: "int",    default: 0, readOnly: true },
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

const schema = {
    id:                { key: "id",              type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:               { key: "ref",             type: "string", default: "", readOnly: true },
    ref_client:        { key: "refClient",       type: "string", default: "" },
    socid:             { key: "socid",           type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    fk_soc:            { key: "fkSoc",            type: "int",    default: 0, aliases: ["socid"], writeFrom: ["socid"] },
    fk_user_author:    { key: "fkUserAuthor",    type: "int",    default: 0, readOnly: true },
    datep:             { key: "datep",           type: "int",    default: 0 },
    datev:             { key: "datev",           type: "int",    default: 0 },
    fin_validite:      { key: "finValidite",     type: "int",    default: 0 },
    total_ht:          { key: "totalHt",         type: "float",  default: 0, readOnly: true },
    total_ttc:         { key: "totalTtc",        type: "float",  default: 0, readOnly: true },
    total_tva:         { key: "totalTva",        type: "float",  default: 0, readOnly: true },
    statut:            { key: "statut",          type: "int",    default: 0, readOnly: true },
    note_public:       { key: "notePublic",      type: "string", default: "" },
    note_private:      { key: "notePrivate",     type: "string", default: "" },
    fk_cond_reglement: { key: "fkCondReglement", type: "int",    default: 0 },
    fk_mode_reglement: { key: "fkModeReglement", type: "int",    default: 0 },
    // Last generated PDF (relative path under DOL_DATA_ROOT). Used by
    // the desktop "Télécharger PDF" button to know whether a PDF exists.
    last_main_doc:     { key: "lastMainDoc",     type: "string", default: "", readOnly: true },
    socname:           { key: "socname",         type: "string", default: "", readOnly: true },
    socEmail:          { key: "socEmail",        type: "string", default: "", readOnly: true },
    lines:             { key: "lines",           default: [], readOnly: true, items: lineSchema },
};

export const proposalLineMapping = new Mapping({ schema: lineSchema, strict: true });
export const proposalMapping = new Mapping({ schema, strict: true });

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return proposalLineMapping.map(raw);
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return proposalLineMapping.reverse(local);
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return proposalMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return proposalMapping.reverse(local);
};
