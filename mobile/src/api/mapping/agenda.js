// Mapping backend (Dolibarr ActionComm) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Les options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toStr manuels)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (id <- id|rowid, socid <- socid|fk_soc)
//   - writeFrom : ecriture multi-source (socid <- socid|fkSoc)
//   - readOnly  : champ lu mais jamais renvoye au serveur (id, ref, fkSoc, tms)
//
// On conserve mapFromBackend/mapToBackend comme interface publique (le hook
// useDbAgenda les consomme) ; agendaMapping est exporte pour l'acces direct
// au schema.
//
// Equivalence avec l'ancien mapper hand-written :
//   - mapFromBackend produisait 19 champs front (id, ref, label, typeCode,
//     datep, datef, percentage, location, fulldayevent, note, fkUserAction,
//     fkUserAssigned, socid, fkSoc, fkContact, fkElement, elementtype, status,
//     updatedAt).
//   - mapToBackend ecrivait 15 cles serveur (label, type_code, datep, datef,
//     percentage, location, fulldayevent, note, fk_user_action,
//     fk_user_assigned, socid, fk_contact, fk_element, elementtype, status).
//     Les 4 champs lus-non-ecrits (id, ref, fkSoc, updatedAt) sont readOnly.
//   - socid en ecriture suivait `local.socid ?? local.fkSoc` -> writeFrom:["fkSoc"].
//     fk_soc n'etait JAMAIS ecrit -> fkSoc reste readOnly (pas de double-write).

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:               { key: "id",             type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:              { key: "ref",            type: "string", default: "", readOnly: true },
    label:            { key: "label",          type: "string", default: "" },
    type_code:        { key: "typeCode",       type: "string", default: "" },
    datep:            { key: "datep",          type: "int",    default: 0 },
    datef:            { key: "datef",          type: "int",    default: 0 },
    percentage:       { key: "percentage",     type: "int",    default: 0 },
    location:         { key: "location",       type: "string", default: "" },
    fulldayevent:     { key: "fulldayevent",   type: "int",    default: 0 },
    note:             { key: "note",           type: "string", default: "" },
    fk_user_action:   { key: "fkUserAction",   type: "int",    default: 0 },
    fk_user_assigned: { key: "fkUserAssigned", type: "int",    default: 0 },
    socid:            { key: "socid",          type: "int",    default: 0, aliases: ["fk_soc"], writeFrom: ["fkSoc"] },
    fk_soc:           { key: "fkSoc",          type: "int",    default: 0, aliases: ["socid"], readOnly: true },
    fk_contact:       { key: "fkContact",      type: "int",    default: 0 },
    fk_element:       { key: "fkElement",      type: "int",    default: 0 },
    elementtype:      { key: "elementtype",    type: "string", default: "" },
    priority:         { key: "priority",       type: "int",    default: 0 },
    fk_project:       { key: "fkProject",      type: "int",    default: 0 },
    status:           { key: "status",         type: "int",    default: 0 },
    tms:              { key: "updatedAt",      type: "int",    default: 0, readOnly: true },
};

export const agendaMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return agendaMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return agendaMapping.reverse(local);
};
