// Mapping backend (Dolibarr Entrepot) <-> front (Dolipocket UI).
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
        description: toStr(raw.description),
        lieu: toStr(raw.lieu),
        address: toStr(raw.address),
        zip: toStr(raw.zip),
        town: toStr(raw.town),
        countryCode: toStr(raw.country_code),
        phone: toStr(raw.phone),
        fax: toStr(raw.fax),
        statut: toInt(raw.statut, 1),
        fkParent: toInt(raw.fk_parent),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        label: toStr(local.label),
        description: toStr(local.description),
        lieu: toStr(local.lieu),
        address: toStr(local.address),
        zip: toStr(local.zip),
        town: toStr(local.town),
        country_code: toStr(local.countryCode),
        phone: toStr(local.phone),
        fax: toStr(local.fax),
        statut: toInt(local.statut, 1),
        fk_parent: toInt(local.fkParent),
    };
};
