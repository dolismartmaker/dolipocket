// Dexie indexes for the project tasks (Task) store. Lot B3.

export const tasksIndexes = `
    id,
    ref,
    fkProject,
    fkTaskParent,
    fkStatut,
    [fkProject+rang]
`;
