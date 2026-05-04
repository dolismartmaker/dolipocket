// Dexie indexes for the stockMovements store.
// Format: comma-separated string of indexed fields. Compound indexes use
// "[field1+field2]" syntax. The first field becomes the primary key.
//
// Stock movements are append-only: no need for a "status" index, only the
// foreign keys used to filter the list views.

export const stockMovementsIndexes = `
    id,
    fkProduct,
    fkEntrepot,
    [fkProduct+datem],
    [fkEntrepot+datem],
    datem
`;
