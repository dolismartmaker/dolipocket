import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend, productMapping } from "./products";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). The keys,
// coercion, completeness and read-only exclusion must match the legacy output.
//
// Legacy contract (commit 2a790ae) :
//   - mapFromBackend : 19 front keys (id..updatedAt), camelCase + coercion.
//   - mapToBackend   : ALWAYS 14 writable server keys, defaulted. price_ttc IS
//                      written (from local.priceTtc) ; id/stock_reel/country_code/
//                      datec/tms are read-only and never written.

const WRITABLE_KEYS = [
    "ref", "label", "description", "type", "price", "price_ttc", "tva_tx",
    "weight", "length", "width", "height", "status", "status_buy", "barcode",
];

describe("products mapper (Mapping-backed)", () => {
    it("exposes the schema mapping instance", () => {
        expect(productMapping).toBeTruthy();
        expect(typeof productMapping.map).toBe("function");
        expect(typeof productMapping.reverse).toBe("function");
    });

    it("returns null/{} on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", ref: "PROD-1", label: "Widget", description: "desc",
            type: "0", price: "12.50", price_ttc: "15.00", tva_tx: "20",
            weight: "1.5", length: "10", width: "5", height: "2",
            stock_reel: "7", status: "1", status_buy: "0", barcode: "3700000000001",
            country_code: "FR", datec: "1700000000", tms: "1700000100",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, ref: "PROD-1", label: "Widget", description: "desc",
            type: 0, price: 12.5, priceTtc: 15, tvaTx: 20,
            weight: 1.5, length: 10, width: 5, height: 2,
            stockReel: 7, status: 1, statusBuy: 0, barcode: "3700000000001",
            countryCode: "FR", createdAt: 1700000000, updatedAt: 1700000100,
        });
    });

    it("reads id from rowid when id is absent (multi-source alias)", () => {
        expect(mapFromBackend({ rowid: "7", ref: "X" }).id).toBe(7);
        // Primary id wins over alias when both present.
        expect(mapFromBackend({ id: "3", rowid: "7" }).id).toBe(3);
    });

    it("guarantees a complete, defaulted read shape on a sparse payload", () => {
        const out = mapFromBackend({ ref: "Solo" });
        expect(out.id).toBe(0);
        expect(out.ref).toBe("Solo");
        expect(out.label).toBe("");
        expect(out.description).toBe("");
        expect(out.type).toBe(0);
        expect(out.price).toBe(0);
        expect(out.priceTtc).toBe(0);
        expect(out.tvaTx).toBe(0);
        expect(out.stockReel).toBe(0);
        expect(out.status).toBe(0);
        expect(out.statusBuy).toBe(0);
        expect(out.barcode).toBe("");
        expect(out.countryCode).toBe("");
        expect(out.createdAt).toBe(0);
        expect(out.updatedAt).toBe(0);
        expect(Object.keys(out)).toHaveLength(19);
    });

    // CRITICAL completeness contract (missed at round 1): the legacy mapToBackend
    // ALWAYS emitted the 14 writable keys, defaulted, regardless of input sparsity.
    it("always writes a complete, defaulted payload from an empty object", () => {
        const payload = mapToBackend({});
        expect(Object.keys(payload).sort()).toEqual([...WRITABLE_KEYS].sort());
        expect(Object.keys(payload)).toHaveLength(14);
        expect(payload.ref).toBe("");
        expect(payload.label).toBe("");
        expect(payload.description).toBe("");
        expect(payload.type).toBe(0);
        expect(payload.price).toBe(0);
        expect(payload.price_ttc).toBe(0);
        expect(payload.tva_tx).toBe(0);
        expect(payload.weight).toBe(0);
        expect(payload.length).toBe(0);
        expect(payload.width).toBe(0);
        expect(payload.height).toBe(0);
        expect(payload.status).toBe(0);
        expect(payload.status_buy).toBe(0);
        expect(payload.barcode).toBe("");
    });

    it("always writes a complete, defaulted payload from a single field", () => {
        const payload = mapToBackend({ label: "Solo" });
        expect(Object.keys(payload)).toHaveLength(14);
        expect(payload.label).toBe("Solo");
        // every other writable key still present and defaulted
        expect(payload.ref).toBe("");
        expect(payload.price).toBe(0);
        expect(payload.price_ttc).toBe(0);
        expect(payload.status).toBe(0);
        expect(payload.barcode).toBe("");
    });

    it("writes back snake_case without read-only/computed fields", () => {
        const local = {
            id: 42, ref: "PROD-1", label: "Widget", description: "desc",
            type: 0, price: 12.5, priceTtc: 15, tvaTx: 20,
            weight: 1.5, length: 10, width: 5, height: 2,
            stockReel: 7, status: 1, statusBuy: 0, barcode: "3700000000001",
            countryCode: "FR", createdAt: 1700000000, updatedAt: 1700000100,
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("rowid");
        expect(payload).not.toHaveProperty("stock_reel");
        expect(payload).not.toHaveProperty("stockReel");
        expect(payload).not.toHaveProperty("country_code");
        expect(payload).not.toHaveProperty("datec");
        expect(payload).not.toHaveProperty("tms");
        // snake_case + coerced
        expect(payload.ref).toBe("PROD-1");
        expect(payload.label).toBe("Widget");
        expect(payload.price).toBe(12.5);
        expect(payload.price_ttc).toBe(15);
        expect(payload.tva_tx).toBe(20);
        expect(payload.status).toBe(1);
        expect(payload.status_buy).toBe(0);
        expect(payload.barcode).toBe("3700000000001");
        expect(Object.keys(payload)).toHaveLength(14);
    });

    it("coerces string numerics on write (legacy toInt/toFloat parity)", () => {
        const payload = mapToBackend({ price: "9.99", type: "1", weight: "2.5" });
        expect(payload.price).toBe(9.99);
        expect(payload.type).toBe(1);
        expect(payload.weight).toBe(2.5);
        // invalid numerics fall back to the field default
        const bad = mapToBackend({ price: "not-a-number", type: "" });
        expect(bad.price).toBe(0);
        expect(bad.type).toBe(0);
    });

    // Point (f): an object carrying a numeric `length` property must be mapped
    // by key (not iterated array-like). The value round-trips without loss.
    it("handles a numeric `length` key without data loss", () => {
        const read = mapFromBackend({ ref: "L", length: 42, width: 3 });
        expect(read.length).toBe(42);
        expect(read.width).toBe(3);
        expect(read.ref).toBe("L");
        expect(Object.keys(read)).toHaveLength(19);

        const write = mapToBackend({ length: 42, width: 3 });
        expect(write.length).toBe(42);
        expect(write.width).toBe(3);
        expect(Object.keys(write)).toHaveLength(14);

        // string-typed length coerces like the legacy toFloat
        expect(mapFromBackend({ length: "12.5" }).length).toBe(12.5);
        expect(mapToBackend({ length: "12.5" }).length).toBe(12.5);
    });
});
