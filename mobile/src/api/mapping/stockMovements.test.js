import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./stockMovements";

// Equivalence with the legacy hand-written stockMovements mapper.
// Legacy specifics:
//  - read: 10 camelCase keys; `value` from raw.value (float); datem as INT.
//  - write base: ALWAYS 6 keys (fk_product, fk_entrepot, qty, label, price,
//    inventorycode), qty from local.value ?? local.qty.
//  - write conditional: type_mouvement (int) and datem (STRING via toStr) are
//    emitted ONLY when present/non-empty (gated -> omitEmpty, no backfill).
//  - id / fk_user_author are read-only.

describe("stockMovements mapper (Mapping-backed)", () => {
    it("returns null/{} on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", fk_product: "7", fk_entrepot: "3", value: "12.5", price: "9.99",
            type_mouvement: "2", label: "Ajustement", datem: "1700000000",
            fk_user_author: "5", inventorycode: "INV-001",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, fkProduct: 7, fkEntrepot: 3, value: 12.5, price: 9.99,
            typeMouvement: 2, label: "Ajustement", datem: 1700000000, fkUserAuthor: 5,
            inventorycode: "INV-001",
        });
    });

    it("reads id from rowid (multi-source, no leak) and value from server value", () => {
        const out = mapFromBackend({ rowid: "7", value: "3.25", label: "X" });
        expect(out.id).toBe(7);
        expect(out.value).toBe(3.25);
        expect(out).not.toHaveProperty("rowid");
    });

    it("guarantees a complete 10-key READ shape on a sparse payload", () => {
        const out = mapFromBackend({ label: "Solo" });
        expect(out).toEqual({
            id: 0, fkProduct: 0, fkEntrepot: 0, value: 0, price: 0, typeMouvement: 0,
            label: "Solo", datem: 0, fkUserAuthor: 0, inventorycode: "",
        });
        expect(Object.keys(out)).toHaveLength(10);
    });

    it("write base payload is the 6 always-emitted keys; datem/type_mouvement omitted when absent", () => {
        const fromEmpty = mapToBackend({});
        expect(fromEmpty).toEqual({
            fk_product: 0, fk_entrepot: 0, qty: 0, price: 0, label: "", inventorycode: "",
        });
        expect(Object.keys(fromEmpty)).toHaveLength(6);
        // empty-string / null gated fields are NOT emitted either (legacy gate)
        expect(mapToBackend({ datem: "", typeMouvement: null })).not.toHaveProperty("datem");
        expect(mapToBackend({ datem: "", typeMouvement: null })).not.toHaveProperty("type_mouvement");
    });

    it("emits datem as a STRING and type_mouvement as int, only when present", () => {
        const payload = mapToBackend({ value: 12.5, fkProduct: 7, fkEntrepot: 3, label: "Aj", price: 9.99, typeMouvement: 2, datem: 1700000000, inventorycode: "INV-001" });
        expect(payload).toEqual({
            fk_product: 7, fk_entrepot: 3, qty: 12.5, price: 9.99, label: "Aj",
            inventorycode: "INV-001", type_mouvement: 2, datem: "1700000000",
        });
        expect(payload.datem).toBe("1700000000"); // string, not number
        expect(Object.keys(payload)).toHaveLength(8);
    });

    it("never writes read-only fields, writes qty from value or the qty fallback", () => {
        const payload = mapToBackend({ id: 42, fkUserAuthor: 5, value: -4 });
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("fk_user_author");
        expect(payload.qty).toBe(-4);
        expect(mapToBackend({ qty: 4 }).qty).toBe(4); // writeFrom fallback
    });
});
