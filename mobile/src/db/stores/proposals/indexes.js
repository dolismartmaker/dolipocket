// Dexie indexes for the proposals store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.
//
// Only header fields are persisted (lines stay server-side). The hook caches
// the header so list/get keep working when offline, but never the line list.

export const proposalsIndexes = `
    id,
    ref,
    socid,
    statut,
    datep,
    finValidite,
    [socid+statut]
`;
