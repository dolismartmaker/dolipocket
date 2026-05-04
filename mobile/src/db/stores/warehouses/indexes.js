// Dexie indexes for the warehouses store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const warehousesIndexes = `
    id,
    ref,
    label,
    statut,
    fkParent
`;
