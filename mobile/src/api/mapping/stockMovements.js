// Mapping backend (Dolibarr MouvementStock) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toFloat/toStr).
//   - default   : shape de sortie stable et complete (contrat de completude :
//                 chaque champ writable est TOUJOURS emis, defaulte).
//   - aliases   : lecture multi-source (id <- id|rowid ; qty <- qty|value).
//   - writeFrom : fallback a l'ecriture (cle serveur qty depuis value ou qty).
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, fk_user_author).
//
// Note: stock movements are append-only on the backend. The POST payload uses
// "qty" (the PHP-side property name) rather than "value" because the
// StockController consumes Product::correct_stock() which expects qty. Le champ
// front est donc `value` : il est LU depuis raw.value et ECRIT sur la cle
// serveur `qty` (avec fallback writeFrom sur une cle front `qty` historique).
//
// `datem` est LU en entier (timestamp) mais ECRIT en string (toStr historique),
// d'ou les fonctions from/to asymetriques. `datem` et `type_mouvement` etaient
// emis par le legacy UNIQUEMENT s'ils etaient presents (jamais 0 par defaut) :
// on reproduit ce comportement avec omitEmpty (ecriture conditionnelle, pas de
// backfill). Les autres champs writable suivent le contrat de completude.

import { Mapping } from "@cap-rel/smartcommon";

const intOr0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const schema = {
    id:             { key: "id",            type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    fk_product:     { key: "fkProduct",     type: "int",    default: 0 },
    fk_entrepot:    { key: "fkEntrepot",    type: "int",    default: 0 },
    // Lu depuis raw.value (alias), ecrit sur la cle serveur "qty"
    // (front key "value", fallback front "qty" via writeFrom).
    qty:            { key: "value",         type: "float",  default: 0, aliases: ["value"], writeFrom: ["qty"] },
    price:          { key: "price",         type: "float",  default: 0 },
    // Conditionnel a l'ecriture (toInt si present), sinon non emis.
    type_mouvement: { key: "typeMouvement", type: "int",    default: 0, omitEmpty: true },
    label:          { key: "label",         type: "string", default: "" },
    // Lu en int, ecrit en string, conditionnel (non emis si vide).
    datem:          { key: "datem",         from: intOr0, to: (v) => String(v), default: 0, omitEmpty: true },
    fk_user_author: { key: "fkUserAuthor",  type: "int",    default: 0, readOnly: true },
    inventorycode:  { key: "inventorycode", type: "string", default: "" },
};

export const stockMovementsMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return stockMovementsMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return stockMovementsMapping.reverse(local);
};
