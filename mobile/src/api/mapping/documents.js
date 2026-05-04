// Mapping backend (SmartAuth ObjectDocumentController) <-> front (Dolipocket UI).
//
// Reference: ~/docs/PWA-GUIDELINES.md section 5.
// - mapFromBackend(raw): normalises a row coming from
//   GET object/{type}/{id}/documents into a stable local shape.
// - mapToBackend(local): inverse, used when caching back to the server.
//
// Both functions are pure: no HTTP, no Dexie, no global state.
//
// The metadata returned by SmartAuth for one document is roughly:
//   {
//     id, share, filename, relative_path,
//     mime_type, size, sha256,
//     date_modification, date_creation,
//     fullname (rare)
//   }
// The "share" hash is the opaque id used to reference the file in the
// download endpoints.

const toInt = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toStr = (value) => (value === undefined || value === null ? "" : String(value));

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const id = raw.id !== undefined && raw.id !== null && raw.id !== ""
        ? toInt(raw.id)
        : null;
    return {
        // Stable client id used by Dexie (share is the only globally unique
        // value SmartAuth returns for a file under a given object).
        id: id !== null && id !== 0 ? id : null,
        share: toStr(raw.share),
        name: toStr(raw.filename ?? raw.name),
        relativePath: toStr(raw.relative_path ?? raw.relativePath),
        mime: toStr(raw.mime_type ?? raw.mime),
        size: toInt(raw.size),
        sha256: toStr(raw.sha256),
        modifiedAt: toInt(raw.date_modification ?? raw.modifiedAt),
        createdAt: toInt(raw.date_creation ?? raw.createdAt),
        objectType: toStr(raw.object_type ?? raw.objectType),
        objectId: toInt(raw.object_id ?? raw.objectId),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        id: toInt(local.id),
        share: toStr(local.share),
        filename: toStr(local.name),
        relative_path: toStr(local.relativePath),
        mime_type: toStr(local.mime),
        size: toInt(local.size),
        sha256: toStr(local.sha256),
        date_modification: toInt(local.modifiedAt),
        date_creation: toInt(local.createdAt),
        object_type: toStr(local.objectType),
        object_id: toInt(local.objectId),
    };
};
