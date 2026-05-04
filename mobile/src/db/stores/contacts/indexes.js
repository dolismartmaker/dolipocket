// Dexie indexes for the contacts store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const contactsIndexes = `
    id,
    lastname,
    firstname,
    email,
    fkSoc,
    [fkSoc+lastname],
    updatedAt
`;
