// Dexie indexes for the supplierInvoices store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const supplierInvoicesIndexes = `
    id,
    ref,
    refSupplier,
    socid,
    statut,
    paye,
    [socid+statut],
    [socid+paye],
    datef,
    updatedAt
`;
