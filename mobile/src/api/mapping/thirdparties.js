// Mapping backend (Dolibarr Societe) <-> front (Dolipocket UI).
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
        name: toStr(raw.name),
        nameAlias: toStr(raw.name_alias),
        codeClient: toStr(raw.code_client),
        codeFournisseur: toStr(raw.code_fournisseur),
        client: toInt(raw.client),
        fournisseur: toInt(raw.fournisseur),
        address: toStr(raw.address),
        zip: toStr(raw.zip),
        town: toStr(raw.town),
        countryCode: toStr(raw.country_code),
        phone: toStr(raw.phone),
        email: toStr(raw.email),
        url: toStr(raw.url),
        siren: toStr(raw.siren),
        siret: toStr(raw.siret),
        ape: toStr(raw.ape),
        idprof4: toStr(raw.idprof4),
        tvaIntra: toStr(raw.tva_intra),
        notePublic: toStr(raw.note_public),
        notePrivate: toStr(raw.note_private),
        status: toInt(raw.status, 1),
        createdAt: toInt(raw.datec),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        name: toStr(local.name),
        name_alias: toStr(local.nameAlias),
        code_client: toStr(local.codeClient),
        code_fournisseur: toStr(local.codeFournisseur),
        client: toInt(local.client),
        fournisseur: toInt(local.fournisseur),
        address: toStr(local.address),
        zip: toStr(local.zip),
        town: toStr(local.town),
        country_code: toStr(local.countryCode),
        phone: toStr(local.phone),
        email: toStr(local.email),
        url: toStr(local.url),
        siren: toStr(local.siren),
        siret: toStr(local.siret),
        ape: toStr(local.ape),
        idprof4: toStr(local.idprof4),
        tva_intra: toStr(local.tvaIntra),
        note_public: toStr(local.notePublic),
        note_private: toStr(local.notePrivate),
        status: toInt(local.status, 1),
    };
};
