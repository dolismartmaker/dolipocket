// Dexie indexes for the recurring invoice templates (FactureRec) store.
// Only header fields are persisted (lines stay server-side).

export const invoiceRecsIndexes = `
    id,
    title,
    socid,
    suspended,
    dateWhen,
    [socid+suspended]
`;
