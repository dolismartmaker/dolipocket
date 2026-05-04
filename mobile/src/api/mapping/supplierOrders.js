// Mapping backend (Dolibarr CommandeFournisseur) <-> front (Dolipocket UI).
//
// Reference for the conventions: ~/docs/PWA-GUIDELINES.md section 5.
// - mapFromBackend(raw): server payload -> normalised local object stored in Dexie.
// - mapToBackend(local): local object -> payload accepted by the smartmaker API.
//
// Both functions are pure: no HTTP, no Dexie, no global state.
// Lines have their own pair of mappers because the backend exposes them as a
// nested array under the header object (raw.lines).

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
        fkCommande: toInt(raw.fk_commande),
        fkProduct: toInt(raw.fk_product),
        ref: toStr(raw.ref),
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
        ref: toStr(local.ref),
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
    const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
    return {
        id: toInt(raw.id ?? raw.rowid),
        ref: toStr(raw.ref),
        refSupplier: toStr(raw.ref_supplier),
        socid: toInt(raw.socid ?? raw.fk_soc),
        fkSoc: toInt(raw.fk_soc ?? raw.socid),
        fkUserAuthor: toInt(raw.fk_user_author),
        dateCommande: toInt(raw.date_commande),
        dateLivraison: toInt(raw.date_livraison),
        totalHt: toFloat(raw.total_ht),
        totalTtc: toFloat(raw.total_ttc),
        totalTva: toFloat(raw.total_tva),
        statut: toInt(raw.statut),
        notePublic: toStr(raw.note_public),
        notePrivate: toStr(raw.note_private),
        fkCondReglement: toInt(raw.fk_cond_reglement),
        fkModeReglement: toInt(raw.fk_mode_reglement),
        thirdpartyName: toStr(raw.thirdparty_name),
        lines: linesRaw.map(mapLineFromBackend).filter(Boolean),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    const payload = {
        socid: toInt(local.socid ?? local.fkSoc),
        ref_supplier: toStr(local.refSupplier),
        date_commande: toInt(local.dateCommande),
        date_livraison: toInt(local.dateLivraison),
        note_public: toStr(local.notePublic),
        note_private: toStr(local.notePrivate),
        fk_cond_reglement: toInt(local.fkCondReglement),
        fk_mode_reglement: toInt(local.fkModeReglement),
    };
    if (Array.isArray(local.lines)) {
        payload.lines = local.lines.map(mapLineToBackend);
    }
    return payload;
};
