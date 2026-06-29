// Mapping backend (Dolibarr Product) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr manuels)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, stock reel,
//                 country_code, dates calculees)
//
// Equivalence avec l'ancien mapper a la main :
//   mapFromBackend emettait 19 champs (id..updatedAt) ; mapToBackend en emettait
//   14 (les champs non readOnly, dont price_ttc), toujours defaultes. La classe
//   Mapping reproduit ces deux contrats (camelCase + coercion + completude).
//
// On conserve mapFromBackend/mapToBackend comme interface publique (les hooks
// useDb<Feature> les consomment) ; productMapping est exporte pour l'acces
// direct au schema.

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:           { key: "id",          type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:          { key: "ref",         type: "string", default: "" },
    label:        { key: "label",       type: "string", default: "" },
    description:  { key: "description", type: "string", default: "" },
    type:         { key: "type",        type: "int",    default: 0 },
    price:        { key: "price",       type: "float",  default: 0 },
    price_ttc:    { key: "priceTtc",    type: "float",  default: 0 },
    tva_tx:       { key: "tvaTx",       type: "float",  default: 0 },
    weight:       { key: "weight",      type: "float",  default: 0 },
    length:       { key: "length",      type: "float",  default: 0 },
    width:        { key: "width",       type: "float",  default: 0 },
    height:       { key: "height",      type: "float",  default: 0 },
    stock_reel:   { key: "stockReel",   type: "float",  default: 0, readOnly: true },
    status:       { key: "status",      type: "int",    default: 0 },
    status_buy:   { key: "statusBuy",   type: "int",    default: 0 },
    barcode:      { key: "barcode",     type: "string", default: "" },
    customcode:   { key: "customcode",  type: "string", default: "" },
    seuil_stock_alerte: { key: "seuilStockAlerte", type: "float", default: 0 },
    desiredstock: { key: "desiredstock", type: "float",  default: 0 },
    note_public:  { key: "notePublic",  type: "string", default: "" },
    country_code: { key: "countryCode", type: "string", default: "", readOnly: true },
    datec:        { key: "createdAt",   type: "int",    default: 0, readOnly: true },
    tms:          { key: "updatedAt",   type: "int",    default: 0, readOnly: true },
};

export const productMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return productMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return productMapping.reverse(local);
};
