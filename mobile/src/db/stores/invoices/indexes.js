// Dexie indexes for the invoices (Facture) store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.
//
// Only header fields are persisted (lines and payments stay server-side).
// The hook caches the header so list/get keep working when offline.

export const invoicesIndexes = `
    id,
    ref,
    socid,
    statut,
    paye,
    datef,
    dateLimReglement,
    [socid+statut],
    [socid+paye]
`;
