// Mapping backend (Dolibarr Propal) <-> front (Dolipocket UI).
//
// Reference for the conventions: ~/docs/PWA-GUIDELINES.md section 5.
// - mapFromBackend(raw): server payload -> normalised local object stored in Dexie.
// - mapToBackend(local): local object -> payload accepted by the smartmaker API.
//
// Both functions are pure: no HTTP, no Dexie, no global state. Lines are
// returned alongside the header when the backend includes them (show()) but
// only the header fields are persisted in Dexie (cf useDbProposals).

const toInt = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toFloat = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toStr = (value) => (value === undefined || value === null ? "" : String(value));

export const mapLineFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return {
        id: toInt(raw.id ?? raw.rowid),
        fkPropal: toInt(raw.fk_propal),
        fkProduct: toInt(raw.fk_product),
        label: toStr(raw.label),
        description: toStr(raw.description),
        qty: toFloat(raw.qty),
        tvaTx: toFloat(raw.tva_tx),
        subprice: toFloat(raw.subprice),
        remisePercent: toFloat(raw.remise_percent),
        totalHt: toFloat(raw.total_ht),
        totalTtc: toFloat(raw.total_ttc),
        rang: toInt(raw.rang),
        productType: toInt(raw.product_type),
    };
};

export const mapLineToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        fk_product: toInt(local.fkProduct),
        label: toStr(local.label),
        description: toStr(local.description),
        qty: toFloat(local.qty),
        tva_tx: toFloat(local.tvaTx),
        subprice: toFloat(local.subprice),
        remise_percent: toFloat(local.remisePercent),
        rang: toInt(local.rang),
        product_type: toInt(local.productType),
    };
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const linesArr = Array.isArray(raw.lines) ? raw.lines.map(mapLineFromBackend).filter(Boolean) : [];
    return {
        id: toInt(raw.id ?? raw.rowid),
        ref: toStr(raw.ref),
        refClient: toStr(raw.ref_client),
        socid: toInt(raw.socid ?? raw.fk_soc),
        fkSoc: toInt(raw.fk_soc ?? raw.socid),
        fkUserAuthor: toInt(raw.fk_user_author),
        datep: toInt(raw.datep),
        datev: toInt(raw.datev),
        finValidite: toInt(raw.fin_validite),
        totalHt: toFloat(raw.total_ht),
        totalTtc: toFloat(raw.total_ttc),
        totalTva: toFloat(raw.total_tva),
        statut: toInt(raw.statut),
        notePublic: toStr(raw.note_public),
        notePrivate: toStr(raw.note_private),
        fkCondReglement: toInt(raw.fk_cond_reglement),
        fkModeReglement: toInt(raw.fk_mode_reglement),
        lines: linesArr,
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        ref_client: toStr(local.refClient),
        socid: toInt(local.socid ?? local.fkSoc),
        fk_soc: toInt(local.fkSoc ?? local.socid),
        datep: toInt(local.datep),
        datev: toInt(local.datev),
        fin_validite: toInt(local.finValidite),
        note_public: toStr(local.notePublic),
        note_private: toStr(local.notePrivate),
        fk_cond_reglement: toInt(local.fkCondReglement),
        fk_mode_reglement: toInt(local.fkModeReglement),
    };
};
