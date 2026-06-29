// Mapping backend (Dolibarr Contact) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toStr manuels)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid, civility <- civility|civility_code)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, dates calculees)
//
// On conserve mapFromBackend/mapToBackend comme interface publique (les hooks
// useDb<Feature> les consomment) ; contactMapping est exporte pour l'acces
// direct au schema. Aucune ligne (Contact n'est pas un document a lignes).

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:           { key: "id",          type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    lastname:     { key: "lastname",    type: "string", default: "" },
    firstname:    { key: "firstname",   type: "string", default: "" },
    civility:     { key: "civility",    type: "string", default: "", aliases: ["civility_code"] },
    fk_soc:       { key: "fkSoc",       type: "int",    default: 0 },
    address:      { key: "address",     type: "string", default: "" },
    zip:          { key: "zip",         type: "string", default: "" },
    town:         { key: "town",        type: "string", default: "" },
    country_code: { key: "countryCode", type: "string", default: "" },
    phone_pro:    { key: "phonePro",    type: "string", default: "" },
    phone_mobile: { key: "phoneMobile", type: "string", default: "" },
    phone_perso:  { key: "phonePerso",  type: "string", default: "" },
    fax:          { key: "fax",         type: "string", default: "" },
    email:        { key: "email",       type: "string", default: "" },
    statut:       { key: "statut",      type: "int",    default: 1 },
    poste:        { key: "poste",       type: "string", default: "" },
    priv:         { key: "priv",        type: "int",    default: 0 },
    default_lang: { key: "defaultLang", type: "string", default: "" },
    note_public:  { key: "notePublic",  type: "string", default: "" },
    note_private: { key: "notePrivate", type: "string", default: "" },
    datec:        { key: "createdAt",   type: "int",    default: 0, readOnly: true },
    tms:          { key: "updatedAt",   type: "int",    default: 0, readOnly: true },
};

export const contactMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return contactMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return contactMapping.reverse(local);
};
