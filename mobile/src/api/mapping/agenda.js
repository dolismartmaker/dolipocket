// Mapping backend (Dolibarr ActionComm) <-> front (Dolipocket UI).
//
// Reference for the conventions: ~/docs/PWA-GUIDELINES.md section 5.
// - mapFromBackend(raw): server payload -> normalised local object stored in Dexie.
// - mapToBackend(local): local object -> payload accepted by the smartmaker API.
//
// Both functions are pure: no HTTP, no Dexie, no global state.

const toInt = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toStr = (value) => (value === undefined || value === null ? "" : String(value));

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return {
        id: toInt(raw.id ?? raw.rowid),
        ref: toStr(raw.ref),
        label: toStr(raw.label),
        typeCode: toStr(raw.type_code),
        datep: toInt(raw.datep),
        datef: toInt(raw.datef),
        percentage: toInt(raw.percentage),
        location: toStr(raw.location),
        fulldayevent: toInt(raw.fulldayevent),
        note: toStr(raw.note),
        fkUserAction: toInt(raw.fk_user_action),
        fkUserAssigned: toInt(raw.fk_user_assigned),
        socid: toInt(raw.socid ?? raw.fk_soc),
        fkSoc: toInt(raw.fk_soc ?? raw.socid),
        fkContact: toInt(raw.fk_contact),
        fkElement: toInt(raw.fk_element),
        elementtype: toStr(raw.elementtype),
        status: toInt(raw.status),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        label: toStr(local.label),
        type_code: toStr(local.typeCode),
        datep: toInt(local.datep),
        datef: toInt(local.datef),
        percentage: toInt(local.percentage),
        location: toStr(local.location),
        fulldayevent: toInt(local.fulldayevent),
        note: toStr(local.note),
        fk_user_action: toInt(local.fkUserAction),
        fk_user_assigned: toInt(local.fkUserAssigned),
        socid: toInt(local.socid ?? local.fkSoc),
        fk_contact: toInt(local.fkContact),
        fk_element: toInt(local.fkElement),
        elementtype: toStr(local.elementtype),
        status: toInt(local.status),
    };
};
