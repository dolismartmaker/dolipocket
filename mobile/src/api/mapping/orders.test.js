import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend, mapLineFromBackend, mapLineToBackend } from "./orders";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend (and the line
// variants) had, now that the mapper is backed by the smartcommon Mapping class
// (standard A). The keys, coercion, completeness and read-only exclusion must
// match the legacy output.
//
// Completeness contract: the legacy mapToBackend ALWAYS returned a full,
// defaulted payload of the 9 writable header keys (and 10 writable line keys),
// regardless of how sparse the front object was. The Mapping class restores this
// via `default` on every writable field, so the assertions below pin the exact
// key counts.

describe("orders mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapLineFromBackend(null)).toBe(null);
        expect(mapLineFromBackend(42)).toBe(null);
        expect(mapLineToBackend(null)).toEqual({});
    });

    it("maps a full server header payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", ref: "CO2026-0001", ref_client: "PO-99", socid: "7", fk_soc: "7",
            fk_user_author: "3", date_commande: "1700000000", date_livraison: "1700100000",
            total_ht: "100.5", total_ttc: "120.6", total_tva: "20.1", statut: "1",
            note_public: "pub", note_private: "priv", fk_cond_reglement: "1", fk_mode_reglement: "2",
            last_main_doc: "commande/CO2026-0001/CO2026-0001.pdf", lines: [],
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, ref: "CO2026-0001", refClient: "PO-99", socid: 7, fkSoc: 7,
            fkUserAuthor: 3, dateCommande: 1700000000, dateLivraison: 1700100000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, statut: 1,
            notePublic: "pub", notePrivate: "priv", fkCondReglement: 1, fkModeReglement: 2,
            lastMainDoc: "commande/CO2026-0001/CO2026-0001.pdf", lines: [],
        });
        expect(Object.keys(mapFromBackend(raw))).toHaveLength(18);
    });

    it("reads id from rowid and socid from fk_soc when primary keys are absent (multi-source)", () => {
        const out = mapFromBackend({ rowid: "7", fk_soc: "9", ref: "X" });
        expect(out.id).toBe(7);
        expect(out.socid).toBe(9);
        expect(out.fkSoc).toBe(9);
        // The raw server alias key must not leak into the front shape.
        expect(out).not.toHaveProperty("rowid");
        expect(out).not.toHaveProperty("fk_soc");
    });

    it("guarantees a complete, defaulted header shape on a sparse payload (read)", () => {
        const out = mapFromBackend({ ref: "Solo" });
        expect(out.id).toBe(0);
        expect(out.socid).toBe(0);
        expect(out.fkSoc).toBe(0);
        expect(out.statut).toBe(0);
        expect(out.notePublic).toBe("");
        expect(out.totalHt).toBe(0);
        expect(out.lastMainDoc).toBe("");
        expect(out.lines).toEqual([]);
        expect(Object.keys(out)).toHaveLength(18);
    });

    it("always writes a complete, defaulted header payload (completeness contract)", () => {
        // mapToBackend({}) and mapToBackend({single field}) must both emit the 9
        // writable header keys, all defaulted. This is the critical contract.
        const fromEmpty = mapToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(9);
        expect(fromEmpty).toEqual({
            ref_client: "",
            socid: 0,
            fk_soc: 0,
            date_commande: 0,
            date_livraison: 0,
            note_public: "",
            note_private: "",
            fk_cond_reglement: 0,
            fk_mode_reglement: 0,
        });

        const fromSparse = mapToBackend({ refClient: "PO-1" });
        expect(Object.keys(fromSparse)).toHaveLength(9);
        expect(fromSparse.ref_client).toBe("PO-1");
        expect(fromSparse.socid).toBe(0);
        expect(fromSparse.note_public).toBe("");
        // read-only fields never appear even on a sparse write
        expect(fromSparse).not.toHaveProperty("id");
        expect(fromSparse).not.toHaveProperty("statut");
        expect(fromSparse).not.toHaveProperty("total_ht");
        expect(fromSparse).not.toHaveProperty("lines");
    });

    it("maps nested lines through the line schema on read", () => {
        const out = mapFromBackend({
            id: "1", ref: "R",
            lines: [{ id: "5", fk_commande: "1", fk_product: "8", label: "Widget", qty: "2", subprice: "10" }],
        });
        expect(out.lines).toHaveLength(1);
        expect(out.lines[0]).toMatchObject({
            id: 5, fkCommande: 1, fkProduct: 8, label: "Widget", qty: 2, subprice: 10,
        });
    });

    it("drops non-array/non-object line collections on read (items safety)", () => {
        expect(mapFromBackend({ ref: "R", lines: "nope" }).lines).toEqual([]);
        expect(mapFromBackend({ ref: "R", lines: [null, 7, { label: "L" }] }).lines).toHaveLength(1);
    });

    it("writes back the header in snake_case without read-only/computed fields", () => {
        const local = {
            id: 42, ref: "CO2026-0001", refClient: "PO-99", socid: 7, fkSoc: 7,
            fkUserAuthor: 3, dateCommande: 1700000000, dateLivraison: 1700100000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, statut: 1,
            notePublic: "pub", notePrivate: "priv", fkCondReglement: 1, fkModeReglement: 2,
            lastMainDoc: "x.pdf", lines: [{ id: 5 }],
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("ref");
        expect(payload).not.toHaveProperty("fk_user_author");
        expect(payload).not.toHaveProperty("total_ht");
        expect(payload).not.toHaveProperty("total_ttc");
        expect(payload).not.toHaveProperty("total_tva");
        expect(payload).not.toHaveProperty("statut");
        expect(payload).not.toHaveProperty("last_main_doc");
        expect(payload).not.toHaveProperty("lines");
        // snake_case + coerced + both soc keys written
        expect(payload.ref_client).toBe("PO-99");
        expect(payload.socid).toBe(7);
        expect(payload.fk_soc).toBe(7);
        expect(payload.date_commande).toBe(1700000000);
        expect(payload.date_livraison).toBe(1700100000);
        expect(payload.note_public).toBe("pub");
        expect(payload.note_private).toBe("priv");
        expect(payload.fk_cond_reglement).toBe(1);
        expect(payload.fk_mode_reglement).toBe(2);
        expect(Object.keys(payload)).toHaveLength(9);
    });

    it("writes both soc keys from fkSoc alone (write-side multi-source)", () => {
        const payload = mapToBackend({ fkSoc: 7 });
        expect(payload.socid).toBe(7);
        expect(payload.fk_soc).toBe(7);
    });

    it("writes both soc keys from socid alone (write-side multi-source)", () => {
        const payload = mapToBackend({ socid: 12 });
        expect(payload.socid).toBe(12);
        expect(payload.fk_soc).toBe(12);
    });

    it("maps a full line payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "5", fk_commande: "1", fk_product: "8", label: "Widget", description: "desc",
            qty: "2", tva_tx: "20", subprice: "10", remise_percent: "5",
            total_ht: "19", total_ttc: "22.8", rang: "1", product_type: "0", special_code: "0",
        };
        expect(mapLineFromBackend(raw)).toEqual({
            id: 5, fkCommande: 1, fkProduct: 8, label: "Widget", description: "desc",
            qty: 2, tvaTx: 20, subprice: 10, remisePercent: 5,
            totalHt: 19, totalTtc: 22.8, rang: 1, productType: 0, specialCode: 0,
        });
        expect(Object.keys(mapLineFromBackend(raw))).toHaveLength(14);
    });

    it("reads line id from rowid when id is absent (multi-source)", () => {
        expect(mapLineFromBackend({ rowid: "9", label: "L" }).id).toBe(9);
    });

    it("guarantees a complete, defaulted line shape on read", () => {
        const out = mapLineFromBackend({ label: "L" });
        expect(Object.keys(out)).toHaveLength(14);
        expect(out.id).toBe(0);
        expect(out.fkCommande).toBe(0);
        expect(out.qty).toBe(0);
        expect(out.label).toBe("L");
        expect(out.specialCode).toBe(0);
    });

    it("always writes a complete, defaulted line payload (completeness contract)", () => {
        const fromEmpty = mapLineToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(10);
        expect(fromEmpty).toEqual({
            fk_product: 0,
            label: "",
            description: "",
            qty: 0,
            tva_tx: 0,
            subprice: 0,
            remise_percent: 0,
            rang: 0,
            product_type: 0,
            special_code: 0,
        });
        // read-only line fields never appear
        expect(fromEmpty).not.toHaveProperty("id");
        expect(fromEmpty).not.toHaveProperty("fk_commande");
        expect(fromEmpty).not.toHaveProperty("total_ht");
        expect(fromEmpty).not.toHaveProperty("total_ttc");
    });

    it("writes back a line in snake_case without read-only/computed fields", () => {
        const local = {
            id: 5, fkCommande: 1, fkProduct: 8, label: "Widget", description: "desc",
            qty: 2, tvaTx: 20, subprice: 10, remisePercent: 5,
            totalHt: 19, totalTtc: 22.8, rang: 1, productType: 0, specialCode: 0,
        };
        const payload = mapLineToBackend(local);
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("fk_commande");
        expect(payload).not.toHaveProperty("total_ht");
        expect(payload).not.toHaveProperty("total_ttc");
        expect(payload.fk_product).toBe(8);
        expect(payload.label).toBe("Widget");
        expect(payload.description).toBe("desc");
        expect(payload.qty).toBe(2);
        expect(payload.tva_tx).toBe(20);
        expect(payload.subprice).toBe(10);
        expect(payload.remise_percent).toBe(5);
        expect(payload.rang).toBe(1);
        expect(payload.product_type).toBe(0);
        expect(payload.special_code).toBe(0);
        expect(Object.keys(payload)).toHaveLength(10);
    });
});
