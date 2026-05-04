// Dexie indexes for the orders (Commande) store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.
//
// Only header fields are persisted (lines stay server-side). The hook caches
// the header so list/get keep working when offline, but never the line list.

export const ordersIndexes = `
    id,
    ref,
    socid,
    statut,
    dateCommande,
    dateLivraison,
    [socid+statut]
`;
