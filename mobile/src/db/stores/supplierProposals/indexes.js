// Dexie indexes for the supplier price requests (SupplierProposal) store.
// Only header fields are persisted (lines stay server-side).

export const supplierProposalsIndexes = `
    id,
    ref,
    socid,
    statut,
    dateCreation,
    [socid+statut]
`;
