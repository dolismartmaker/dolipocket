import { describe, expect, it } from "vitest";

import {
    mapFromBackend,
    mapToBackend,
    mapLineFromBackend,
    mapLineToBackend,
} from "./supplierOrders";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). Keys,
// coercion, completeness and read-only exclusion must match the legacy output:
//   - header writable payload = 8 scalar keys, always defaulted (completeness)
//   - lines are written back ONLY when present as an array (legacy isArray gate
//     -> omitEmpty), mapped through the line schema
//   - line writable payload = 11 keys, always defaulted
//   - socid read from socid|fk_soc, written from socid|fkSoc; fk_soc never written

describe("supplierOrders line mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapLineFromBackend(null)).toBe(null);
        expect(mapLineFromBackend(undefined)).toBe(null);
        expect(mapLineFromBackend(42)).toBe(null);
        expect(mapLineToBackend(null)).toEqual({});
        expect(mapLineToBackend(undefined)).toEqual({});
    });

    it("maps a full server line to the camelCase front shape with coercion", () => {
        const raw = {
            id: "5", fk_commande: "12", fk_product: "33", ref: "L1", label: "Widget",
            description: "desc", qty: "2.5", tva_tx: "20", subprice: "10.5",
            remise_percent: "5", total_ht: "100", total_ttc: "120", rang: "3",
            product_type: "0", special_code: "104",
        };
        expect(mapLineFromBackend(raw)).toEqual({
            id: 5, fkCommande: 12, fkProduct: 33, ref: "L1", label: "Widget",
            description: "desc", qty: 2.5, tvaTx: 20, subprice: 10.5,
            remisePercent: 5, totalHt: 100, totalTtc: 120, rang: 3,
            productType: 0, specialCode: 104,
        });
    });

    it("reads line id from rowid when id is absent (multi-source)", () => {
        expect(mapLineFromBackend({ rowid: "9", label: "X" }).id).toBe(9);
    });

    it("guarantees a complete, defaulted line shape on a sparse payload", () => {
        const out = mapLineFromBackend({ label: "Solo" });
        expect(out.id).toBe(0);
        expect(out.fkCommande).toBe(0);
        expect(out.qty).toBe(0);
        expect(out.specialCode).toBe(0);
        expect(out.description).toBe("");
        expect(out.label).toBe("Solo");
        expect(Object.keys(out)).toHaveLength(15);
    });

    it("always writes a complete, defaulted line payload (completeness contract)", () => {
        // 11 writable line keys (id / fk_commande / total_ht / total_ttc read-only).
        const payload = mapLineToBackend({ description: "Solo" });
        expect(Object.keys(payload)).toHaveLength(11);
        expect(payload.description).toBe("Solo");
        expect(payload.qty).toBe(0);
        expect(payload.tva_tx).toBe(0);
        expect(payload.product_type).toBe(0);
        expect(payload.special_code).toBe(0);
        // read-only / computed line fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("fk_commande");
        expect(payload).not.toHaveProperty("total_ht");
        expect(payload).not.toHaveProperty("total_ttc");
        expect(Object.keys(mapLineToBackend({}))).toHaveLength(11);
        expect(mapLineToBackend({})).toHaveProperty("product_type", 0);
    });

    it("writes back a line in snake_case with coercion (full round-trip)", () => {
        const local = {
            id: 5, fkCommande: 12, fkProduct: 33, ref: "L1", label: "Widget",
            description: "desc", qty: 2.5, tvaTx: 20, subprice: 10.5,
            remisePercent: 5, totalHt: 100, totalTtc: 120, rang: 3,
            productType: 0, specialCode: 104,
        };
        const payload = mapLineToBackend(local);
        expect(payload).toEqual({
            fk_product: 33, ref: "L1", label: "Widget", description: "desc",
            qty: 2.5, tva_tx: 20, subprice: 10.5, remise_percent: 5,
            rang: 3, product_type: 0, special_code: 104,
        });
        expect(Object.keys(payload)).toHaveLength(11);
    });

    it("converts a camelCase line input from the create flow into snake_case", () => {
        // The mobile edit page submits create lines with camelCase fields.
        const payload = mapLineToBackend({
            description: "d", qty: 2, subprice: 10, tvaTx: 20, remisePercent: 5,
        });
        expect(payload.description).toBe("d");
        expect(payload.qty).toBe(2);
        expect(payload.subprice).toBe(10);
        expect(payload.tva_tx).toBe(20);
        expect(payload.remise_percent).toBe(5);
        // backfilled writable defaults preserve the complete contract
        expect(payload.fk_product).toBe(0);
        expect(payload.product_type).toBe(0);
        expect(Object.keys(payload)).toHaveLength(11);
    });
});

describe("supplierOrders header mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend("x")).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", ref: "PO2406-0001", ref_supplier: "SUP-1", socid: "7", fk_soc: "7",
            fk_user_author: "3", date_commande: "1700000000", date_livraison: "1700100000",
            total_ht: "100.5", total_ttc: "120.6", total_tva: "20.1", statut: "3",
            note_public: "pub", note_private: "priv", fk_cond_reglement: "1",
            fk_mode_reglement: "2", thirdparty_name: "ACME", last_main_doc: "po/po1.pdf",
            tms: "1700000100",
            lines: [
                {
                    id: "1", fk_commande: "42", fk_product: "33", label: "Widget",
                    qty: "2", subprice: "10", tva_tx: "20", total_ht: "20", rang: "1",
                    product_type: "0", special_code: "0",
                },
            ],
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, ref: "PO2406-0001", refSupplier: "SUP-1", socid: 7, fkSoc: 7,
            fkUserAuthor: 3, dateCommande: 1700000000, dateLivraison: 1700100000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, statut: 3,
            notePublic: "pub", notePrivate: "priv", fkCondReglement: 1,
            fkModeReglement: 2, thirdpartyName: "ACME", lastMainDoc: "po/po1.pdf",
            updatedAt: 1700000100,
            lines: [
                {
                    id: 1, fkCommande: 42, fkProduct: 33, ref: "", label: "Widget",
                    description: "", qty: 2, tvaTx: 20, subprice: 10, remisePercent: 0,
                    totalHt: 20, totalTtc: 0, rang: 1, productType: 0, specialCode: 0,
                },
            ],
        });
    });

    it("reads id from rowid and socid from fk_soc (multi-source)", () => {
        const out = mapFromBackend({ rowid: "7", fk_soc: "9", ref: "X" });
        expect(out.id).toBe(7);
        expect(out.socid).toBe(9);
        expect(out.fkSoc).toBe(9);
    });

    it("reads fkSoc from socid when fk_soc is absent (reverse multi-source)", () => {
        const out = mapFromBackend({ socid: "11", ref: "Y" });
        expect(out.socid).toBe(11);
        expect(out.fkSoc).toBe(11);
    });

    it("collapses a non-array lines payload to [] and drops non-object entries", () => {
        expect(mapFromBackend({ ref: "PO" }).lines).toEqual([]);
        expect(mapFromBackend({ lines: "nope" }).lines).toEqual([]);
        expect(mapFromBackend({ lines: [null, 7, { label: "L1" }] }).lines).toHaveLength(1);
    });

    it("guarantees a complete, defaulted header shape on a sparse payload", () => {
        const out = mapFromBackend({ ref: "Solo" });
        expect(out.id).toBe(0);
        expect(out.socid).toBe(0);
        expect(out.fkSoc).toBe(0);
        expect(out.statut).toBe(0);
        expect(out.notePublic).toBe("");
        expect(out.lastMainDoc).toBe("");
        expect(out.totalHt).toBe(0);
        expect(out.lines).toEqual([]);
        // 20 front keys: 8 writable + 12 read-only (including lines).
        expect(Object.keys(out)).toHaveLength(20);
    });

    it("always writes a complete, defaulted header payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 8 writable header keys.
        const payload = mapToBackend({ refSupplier: "SUP-1" });
        expect(Object.keys(payload)).toHaveLength(8);
        expect(payload.ref_supplier).toBe("SUP-1");
        expect(payload.socid).toBe(0);
        expect(payload.date_commande).toBe(0);
        expect(payload.date_livraison).toBe(0);
        expect(payload.note_public).toBe("");
        expect(payload.note_private).toBe("");
        expect(payload.fk_cond_reglement).toBe(0);
        expect(payload.fk_mode_reglement).toBe(0);
        expect(Object.keys(mapToBackend({}))).toHaveLength(8);
        expect(mapToBackend({})).toHaveProperty("socid", 0);
    });

    it("excludes read-only/computed fields but writes lines (mapped) when present", () => {
        const local = {
            id: 42, ref: "PO2406-0001", refSupplier: "SUP-1", socid: 7, fkSoc: 7,
            fkUserAuthor: 3, dateCommande: 1700000000, dateLivraison: 1700100000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, statut: 3,
            notePublic: "pub", notePrivate: "priv", fkCondReglement: 1,
            fkModeReglement: 2, thirdpartyName: "ACME", lastMainDoc: "po/po1.pdf",
            updatedAt: 1700000100,
            lines: [{ fkProduct: 33, qty: 2 }],
        };
        const payload = mapToBackend(local);
        // 8 scalar header keys + the mapped lines array (legacy emitted lines
        // whenever local.lines was an array)
        expect(Object.keys(payload)).toHaveLength(9);
        expect(payload).toMatchObject({
            socid: 7, ref_supplier: "SUP-1", date_commande: 1700000000,
            date_livraison: 1700100000, note_public: "pub", note_private: "priv",
            fk_cond_reglement: 1, fk_mode_reglement: 2,
        });
        expect(payload.lines).toHaveLength(1);
        expect(payload.lines[0]).toMatchObject({ fk_product: 33, qty: 2, special_code: 0 });
        // read-only / computed never sent back on the header reverse
        ["id", "ref", "fk_soc", "fk_user_author", "total_ht", "total_ttc", "total_tva", "statut", "thirdparty_name", "last_main_doc", "tms"]
            .forEach((k) => expect(payload).not.toHaveProperty(k));
    });

    it("omits lines from the header payload when local.lines is absent (legacy gate)", () => {
        const payload = mapToBackend({ refSupplier: "SUP-1" });
        expect(payload).not.toHaveProperty("lines");
        expect(Object.keys(payload)).toHaveLength(8);
    });

    it("writes socid from the fkSoc front fallback (writeFrom)", () => {
        const payload = mapToBackend({ fkSoc: 7 });
        expect(payload.socid).toBe(7);
        // fk_soc server key is read-only -> never emitted.
        expect(payload).not.toHaveProperty("fk_soc");
        expect(Object.keys(payload)).toHaveLength(8);
    });

    it("recovers socid from fkSoc when the primary socid is null", () => {
        const payload = mapToBackend({ socid: null, fkSoc: 7 });
        expect(payload.socid).toBe(7);
    });
});
