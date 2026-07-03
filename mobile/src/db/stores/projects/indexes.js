// Dexie indexes for the projects (Project) store. Lot B1.
// Only header fields are persisted (tasks/time live server-side, lot B3/B4).

export const projectsIndexes = `
    id,
    ref,
    socid,
    statut,
    dateCreation,
    [socid+statut]
`;
