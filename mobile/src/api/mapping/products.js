// Mapping backend (Dolibarr Product) <-> front (Dolipocket UI).
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

const toFloat = (value, fallback = 0) => {
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
        type: toInt(raw.type),
        price: toFloat(raw.price),
        priceTtc: toFloat(raw.price_ttc),
        tvaTx: toFloat(raw.tva_tx),
        weight: toFloat(raw.weight),
        length: toFloat(raw.length),
        width: toFloat(raw.width),
        height: toFloat(raw.height),
        stockReel: toFloat(raw.stock_reel),
        status: toInt(raw.status),
        statusBuy: toInt(raw.status_buy),
        barcode: toStr(raw.barcode),
        countryCode: toStr(raw.country_code),
        createdAt: toInt(raw.datec),
        updatedAt: toInt(raw.tms),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    return {
        ref: toStr(local.ref),
        label: toStr(local.label),
        description: toStr(local.description),
        type: toInt(local.type),
        price: toFloat(local.price),
        price_ttc: toFloat(local.priceTtc),
        tva_tx: toFloat(local.tvaTx),
        weight: toFloat(local.weight),
        length: toFloat(local.length),
        width: toFloat(local.width),
        height: toFloat(local.height),
        status: toInt(local.status),
        status_buy: toInt(local.statusBuy),
        barcode: toStr(local.barcode),
    };
};
