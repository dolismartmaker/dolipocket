// Mapping backend (Dolibarr Contact) <-> front (Dolipocket UI).
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
        lastname: toStr(raw.lastname),
        firstname: toStr(raw.firstname),
        civility: toStr(raw.civility ?? raw.civility_code),
        fkSoc: toInt(raw.fk_soc),
        address: toStr(raw.address),
        zip: toStr(raw.zip),
        town: toStr(raw.town),
        countryCode: toStr(raw.country_code),
        phonePro: toStr(raw.phone_pro),
        phoneMobile: toStr(raw.phone_mobile),
        fax: toStr(raw.fax),
        email: toStr(raw.email),
        statut: toInt(raw.statut, 1),
        poste: toStr(raw.poste),
        notePublic: toStr(raw.note_public),
        notePrivate: toStr(raw.note_private),
        createdAt: toInt(raw.datec),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        lastname: toStr(local.lastname),
        firstname: toStr(local.firstname),
        civility: toStr(local.civility),
        fk_soc: toInt(local.fkSoc),
        address: toStr(local.address),
        zip: toStr(local.zip),
        town: toStr(local.town),
        country_code: toStr(local.countryCode),
        phone_pro: toStr(local.phonePro),
        phone_mobile: toStr(local.phoneMobile),
        fax: toStr(local.fax),
        email: toStr(local.email),
        statut: toInt(local.statut, 1),
        poste: toStr(local.poste),
        note_public: toStr(local.notePublic),
        note_private: toStr(local.notePrivate),
    };
};
