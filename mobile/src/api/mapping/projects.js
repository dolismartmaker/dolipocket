// Mapping backend (Dolibarr Project) <-> front (Dolipocket UI). Lot B1.
//
// A project is a header-only object (its "lines" are Tasks, a separate feature
// of lot B3). The backend dmProject mapper emits snake_case keys; the schema
// keys below are snake_case and the produced front keys are camelCase.
//
// Dates (dateStart / dateEnd / ...) are Unix seconds on read (Dolibarr jdate);
// on write the edit form passes milliseconds and the backend PaginatedListTrait
// ::normalizeTimestamp converts ms -> seconds transparently.

import { Mapping } from "@cap-rel/smartcommon";

const schema = {
    id:                   { key: "id",                 type: "int",    default: 0, aliases: ["rowid"], readOnly: true },
    ref:                  { key: "ref",                type: "string", default: "", readOnly: true },
    title:                { key: "title",              type: "string", default: "" },
    socid:                { key: "socid",              type: "int",    default: 0 },
    socname:              { key: "socname",            type: "string", default: "", readOnly: true },
    socEmail:             { key: "socEmail",           type: "string", default: "", readOnly: true },
    description:          { key: "description",        type: "string", default: "" },
    public:               { key: "public",             type: "int",    default: 0 },
    date_start:           { key: "dateStart",          type: "int",    default: 0 },
    date_end:             { key: "dateEnd",            type: "int",    default: 0 },
    date_close:           { key: "dateClose",          type: "int",    default: 0, readOnly: true },
    statut:               { key: "statut",             type: "int",    default: 0, readOnly: true },
    fk_opp_status:        { key: "fkOppStatus",        type: "int",    default: 0 },
    opp_percent:          { key: "oppPercent",         type: "float",  default: 0 },
    opp_amount:           { key: "oppAmount",          type: "float",  default: 0 },
    budget_amount:        { key: "budgetAmount",       type: "float",  default: 0 },
    usage_opportunity:    { key: "usageOpportunity",   type: "int",    default: 0 },
    usage_task:           { key: "usageTask",          type: "int",    default: 0 },
    usage_bill_time:      { key: "usageBillTime",      type: "int",    default: 0 },
    usage_organize_event: { key: "usageOrganizeEvent", type: "int",    default: 0, readOnly: true },
    note_public:          { key: "notePublic",         type: "string", default: "" },
    note_private:         { key: "notePrivate",        type: "string", default: "" },
    model_pdf:            { key: "modelPdf",           type: "string", default: "", readOnly: true },
    fk_user_author:       { key: "fkUserAuthor",       type: "int",    default: 0, readOnly: true },
    fk_user_close:        { key: "fkUserClose",        type: "int",    default: 0, readOnly: true },
    date_creation:        { key: "dateCreation",       type: "int",    default: 0, readOnly: true },
    label:                { key: "label",              type: "string", default: "", readOnly: true },
};

export const projectMapping = new Mapping({ schema, strict: true });

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return projectMapping.map(raw);
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return projectMapping.reverse(local);
};
