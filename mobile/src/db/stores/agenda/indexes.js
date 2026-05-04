// Dexie indexes for the agenda (ActionComm) store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.

export const agendaIndexes = `
    id,
    ref,
    typeCode,
    datep,
    datef,
    fkUserAssigned,
    socid,
    status,
    [fkUserAssigned+status],
    updatedAt
`;
