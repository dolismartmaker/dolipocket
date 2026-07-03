// Mapping backend (Dolibarr Task) <-> front (Dolipocket UI). Lot B3.
//
// A task belongs to a project (fkProject) and forms a tree via fkTaskParent +
// rang. Durations (plannedWorkload, durationEffective) are in SECONDS on both
// sides; the UI converts hours <-> seconds. Dates are Unix seconds on read; the
// edit form passes milliseconds and the backend normalises ms -> seconds.

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:                 { key: "id",                type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                { key: "ref",               type: "string", default: "", readOnly: true },
    label:              { key: "label",             type: "string", default: "" },
    description:        { key: "description",       type: "string", default: "" },
    fk_project:         { key: "fkProject",         type: "int",    default: 0 },
    fk_task_parent:     { key: "fkTaskParent",      type: "int",    default: 0 },
    date_start:         { key: "dateStart",         type: "int",    default: 0 },
    date_end:           { key: "dateEnd",           type: "int",    default: 0 },
    date_creation:      { key: "dateCreation",      type: "int",    default: 0, readOnly: true },
    planned_workload:   { key: "plannedWorkload",   type: "int",    default: 0 },
    duration_effective: { key: "durationEffective", type: "int",    default: 0, readOnly: true },
    progress:           { key: "progress",          type: "int",    default: 0 },
    priority:           { key: "priority",          type: "int",    default: 0 },
    fk_statut:          { key: "fkStatut",          type: "int",    default: 0, readOnly: true },
    budget_amount:      { key: "budgetAmount",      type: "float",  default: 0 },
    note_public:        { key: "notePublic",        type: "string", default: "" },
    note_private:       { key: "notePrivate",       type: "string", default: "" },
    rang:               { key: "rang",              type: "int",    default: 0 },
    fk_user_author:     { key: "fkUserAuthor",      type: "int",    default: 0, readOnly: true },
};

export const taskMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return taskMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return taskMapping.reverse(local);
};
