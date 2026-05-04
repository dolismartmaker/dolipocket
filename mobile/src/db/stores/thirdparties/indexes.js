// Dexie indexes for the thirdparties store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const thirdpartiesIndexes = `
    id,
    name,
    client,
    fournisseur,
    [client+fournisseur],
    updatedAt
`;
