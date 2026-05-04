// Dexie indexes for the supplierOrders store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const supplierOrdersIndexes = `
    id,
    ref,
    refSupplier,
    socid,
    statut,
    [socid+statut],
    dateCommande,
    updatedAt
`;
