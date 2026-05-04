// Dexie indexes for the products store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const productsIndexes = `
    id,
    ref,
    label,
    type,
    barcode,
    status,
    [type+status],
    updatedAt
`;
