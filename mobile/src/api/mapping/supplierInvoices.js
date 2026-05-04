// Mapping backend (Dolibarr FactureFournisseur) <-> front (Dolipocket UI).
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
        fkFactureFourn: toInt(raw.fk_facture_fourn),
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

// Map a payment entry attached to a supplier invoice (read-only).
// Backend shape: { id, date, amount, mode_code, mode_label }.
const mapPaymentFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    return {
        id: toInt(raw.id ?? raw.rowid),
        date: toInt(raw.date),
        amount: toFloat(raw.amount),
        modeCode: toStr(raw.mode_code ?? raw.modeCode),
        modeLabel: toStr(raw.mode_label ?? raw.modeLabel),
    };
};

export const mapFromBackend = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
    const paymentsRaw = Array.isArray(raw.payments) ? raw.payments : [];
    return {
        id: toInt(raw.id ?? raw.rowid),
        ref: toStr(raw.ref),
        refSupplier: toStr(raw.ref_supplier),
        socid: toInt(raw.socid ?? raw.fk_soc),
        fkSoc: toInt(raw.fk_soc ?? raw.socid),
        type: toInt(raw.type),
        datef: toInt(raw.datef),
        dateLimReglement: toInt(raw.date_lim_reglement),
        totalHt: toFloat(raw.total_ht),
        totalTtc: toFloat(raw.total_ttc),
        totalTva: toFloat(raw.total_tva),
        paye: toInt(raw.paye),
        statut: toInt(raw.statut),
        notePublic: toStr(raw.note_public),
        notePrivate: toStr(raw.note_private),
        fkCondReglement: toInt(raw.fk_cond_reglement),
        fkModeReglement: toInt(raw.fk_mode_reglement),
        libelle: toStr(raw.libelle),
        thirdpartyName: toStr(raw.thirdparty_name),
        lines: linesRaw.map(mapLineFromBackend).filter(Boolean),
        // Read-only payments recap exposed by SupplierInvoiceController::show().
        payments: paymentsRaw.map(mapPaymentFromBackend).filter(Boolean),
        totalPaid: toFloat(raw.total_paid),
        remainToPay: toFloat(raw.remain_to_pay),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    const payload = {
        socid: toInt(local.socid ?? local.fkSoc),
        ref_supplier: toStr(local.refSupplier),
        type: toInt(local.type),
        datef: toInt(local.datef),
        date_lim_reglement: toInt(local.dateLimReglement),
        note_public: toStr(local.notePublic),
        note_private: toStr(local.notePrivate),
        fk_cond_reglement: toInt(local.fkCondReglement),
        fk_mode_reglement: toInt(local.fkModeReglement),
        libelle: toStr(local.libelle),
    };
    if (Array.isArray(local.lines)) {
        payload.lines = local.lines.map(mapLineToBackend);
    }
    return payload;
};
