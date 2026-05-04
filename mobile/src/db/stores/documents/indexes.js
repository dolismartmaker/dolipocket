// Dexie indexes for the documents store.
//
// The natural primary key for a document is the "share" hash returned by
// SmartAuth (it is unique across all objects, opaque, and stable for a given
// file). The compound index [objectType+objectId] lets useDbDocuments cache
// per-object listings without scanning the whole table.

export const documentsIndexes = `
    &share,
    objectType,
    objectId,
    [objectType+objectId],
    modifiedAt
`;
