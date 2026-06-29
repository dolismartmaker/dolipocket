// Mapping backend (SmartAuth ObjectDocumentController) <-> front (Dolipocket UI).
//
// Standard A (cf ~/docs/PWA-GUIDELINES.md section 13) : la correspondance des
// champs est declaree UNE fois dans un schema `Mapping` smartcommon, qui derive
// les deux sens. Options utilisees ici :
//   - type      : coercition declarative (remplace les toInt/toStr manuels)
//   - default   : shape de sortie stable et complete (lecture ET ecriture)
//   - aliases   : lecture multi-source (filename <- filename|name, etc.). La
//                 metadonnee SmartAuth est en snake_case, mais un objet deja
//                 mappe (cache, re-emission) peut etre en camelCase : l'alias
//                 couvre les deux origines comme le faisait `a ?? b` historique.
//
// La metadonnee renvoyee par SmartAuth pour un document est en gros :
//   { id, share, filename, relative_path, mime_type, size, sha256,
//     date_modification, date_creation, object_type, object_id }
// Le hash "share" est l'identifiant opaque qui reference le fichier dans les
// endpoints de telechargement (c'est aussi la cle primaire Dexie).
//
// On conserve mapFromBackend/mapToBackend comme interface publique (le hook
// useDbDocuments les consomme) ; documentsMapping est exporte pour l'acces
// direct au schema. Fonctions pures : pas d'HTTP, pas de Dexie, pas d'etat
// global.

import { Mapping } from "@cap-rel/smartcommon";

// Chaque entree est keyee par la cle SERVEUR (snake), `key` porte le nom front
// (camel). `type` reproduit toInt/toStr, `default` garantit la shape complete
// identique a l'ancien (lecture et ecriture). `id` est special : LU en null
// quand absent/0/invalide (sentinelle historique), ECRIT en entier (toInt, 0
// par defaut) -> from/to asymetriques + default null.
const schema = {
    id:                { key: "id", from: (v) => { const n = Number(v); return (Number.isFinite(n) && n !== 0) ? n : null; }, to: (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; }, default: null },
    share:             { key: "share",        type: "string", default: "" },
    filename:          { key: "name",         type: "string", default: "", aliases: ["name"] },
    relative_path:     { key: "relativePath", type: "string", default: "", aliases: ["relativePath"] },
    mime_type:         { key: "mime",         type: "string", default: "", aliases: ["mime"] },
    size:              { key: "size",         type: "int",    default: 0 },
    sha256:            { key: "sha256",       type: "string", default: "" },
    date_modification: { key: "modifiedAt",   type: "int",    default: 0, aliases: ["modifiedAt"] },
    date_creation:     { key: "createdAt",    type: "int",    default: 0, aliases: ["createdAt"] },
    object_type:       { key: "objectType",   type: "string", default: "", aliases: ["objectType"] },
    object_id:         { key: "objectId",     type: "int",    default: 0, aliases: ["objectId"] },
};

export const documentsMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return documentsMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return documentsMapping.reverse(local);
};
