// Mapping backend (Dolibarr Entrepot) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toStr manuels)
//   - default   : shape de sortie stable et complete, en lecture ET en ecriture
//   - aliases   : lecture multi-source cote serveur (id <- id|rowid)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref)
//
// Equivalence avec l'ancien mapper a la main :
//   - mapFromBackend : 13 champs (id|rowid -> id, statut defaut 1, le reste
//     defaut "" ou 0 selon le type).
//   - mapToBackend   : 11 champs TOUJOURS emis et defaultes (contrat de
//     completude), id et ref exclus car read-only.
//
// On conserve mapFromBackend/mapToBackend comme interface publique (les hooks
// useDb<Feature> les consomment) ; warehousesMapping est exporte pour l'acces
// direct au schema.

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:           { key: "id",          type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:          { key: "ref",         type: "string", default: "", readOnly: true },
    label:        { key: "label",       type: "string", default: "" },
    description:  { key: "description", type: "string", default: "" },
    lieu:         { key: "lieu",        type: "string", default: "" },
    address:      { key: "address",     type: "string", default: "" },
    zip:          { key: "zip",         type: "string", default: "" },
    town:         { key: "town",        type: "string", default: "" },
    country_code: { key: "countryCode", type: "string", default: "" },
    phone:        { key: "phone",       type: "string", default: "" },
    fax:          { key: "fax",         type: "string", default: "" },
    statut:       { key: "statut",      type: "int",    default: 1 },
    fk_parent:    { key: "fkParent",    type: "int",    default: 0 },
};

export const warehousesMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return warehousesMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return warehousesMapping.reverse(local);
};
