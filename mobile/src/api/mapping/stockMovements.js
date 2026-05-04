// Mapping backend (Dolibarr MouvementStock) <-> front (Dolipocket UI).
//
// Reference for the conventions: ~/docs/PWA-GUIDELINES.md section 5.
// - mapFromBackend(raw): server payload -> normalised local object stored in Dexie.
// - mapToBackend(local): local object -> payload accepted by the smartmaker API.
//
// Both functions are pure: no HTTP, no Dexie, no global state.
//
// Note: stock movements are append-only on the backend. The POST payload uses
// "qty" (the PHP-side property name) rather than "value" because the
// StockController consumes Product::correct_stock() which expects qty.

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
        fkProduct: toInt(raw.fk_product),
        fkEntrepot: toInt(raw.fk_entrepot),
        value: toFloat(raw.value),
        price: toFloat(raw.price),
        typeMouvement: toInt(raw.type_mouvement),
        label: toStr(raw.label),
        datem: toInt(raw.datem),
        fkUserAuthor: toInt(raw.fk_user_author),
        inventorycode: toStr(raw.inventorycode),
    };
};

export const mapToBackend = (local) => {
    if (!local || typeof local !== "object") return {};
    const payload = {
        fk_product: toInt(local.fkProduct),
        fk_entrepot: toInt(local.fkEntrepot),
        qty: toFloat(local.value ?? local.qty),
        label: toStr(local.label),
        price: toFloat(local.price),
        inventorycode: toStr(local.inventorycode),
    };
    if (local.typeMouvement !== undefined && local.typeMouvement !== null && local.typeMouvement !== "") {
        payload.type_mouvement = toInt(local.typeMouvement);
    }
    if (local.datem !== undefined && local.datem !== null && local.datem !== "") {
        payload.datem = toStr(local.datem);
    }
    return payload;
};
