// Mapping backend (Dolibarr Societe) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toStr manuels)
//   - default   : shape de sortie stable et complete
//   - aliases   : lecture multi-source (id <- id|rowid)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, dates calculees)
//
// On conserve mapFromBackend/mapToBackend comme interface publique (les hooks
// useDb<Feature> les consomment) ; thirdpartyMapping est exporte pour l'acces
// direct au schema.

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:               { key: "id",               type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    name:             { key: "name",             type: "string", default: "" },
    name_alias:       { key: "nameAlias",        type: "string", default: "" },
    code_client:      { key: "codeClient",       type: "string", default: "" },
    code_fournisseur: { key: "codeFournisseur",  type: "string", default: "" },
    client:           { key: "client",           type: "int",    default: 0 },
    fournisseur:      { key: "fournisseur",      type: "int",    default: 0 },
    address:          { key: "address",          type: "string", default: "" },
    zip:              { key: "zip",               type: "string", default: "" },
    town:             { key: "town",              type: "string", default: "" },
    country_code:     { key: "countryCode",       type: "string", default: "" },
    phone:            { key: "phone",             type: "string", default: "" },
    email:            { key: "email",             type: "string", default: "" },
    url:              { key: "url",               type: "string", default: "" },
    siren:            { key: "siren",             type: "string", default: "" },
    siret:            { key: "siret",             type: "string", default: "" },
    ape:              { key: "ape",               type: "string", default: "" },
    idprof4:          { key: "idprof4",           type: "string", default: "" },
    tva_intra:        { key: "tvaIntra",          type: "string", default: "" },
    tva_assuj:        { key: "tvaAssuj",          type: "int",    default: 1 },
    code_compta:      { key: "codeCompta",        type: "string", default: "" },
    code_compta_fournisseur: { key: "codeComptaFournisseur", type: "string", default: "" },
    note_public:      { key: "notePublic",        type: "string", default: "" },
    note_private:     { key: "notePrivate",       type: "string", default: "" },
    status:           { key: "status",            type: "int",    default: 1 },
    datec:            { key: "createdAt",          type: "int",    default: 0, readOnly: true },
    tms:              { key: "updatedAt",          type: "int",    default: 0, readOnly: true },
};

export const thirdpartyMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return thirdpartyMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return thirdpartyMapping.reverse(local);
};
