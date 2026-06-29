import { describe, expect, it } from "vitest";

import {
    mapFromBackend,
    mapToBackend,
    mapLineFromBackend,
    mapLineToBackend,
} from "./proposals";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend (+ the line
// variants) had, now that the mapper is backed by the smartcommon Mapping class
// (standard A). Keys, coercion, completeness, read-only exclusion and the
// socid/fk_soc multi-source redundancy must match the legacy output exactly.

describe("proposals mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapLineFromBackend(null)).toBe(null);
        expect(mapLineFromBackend(undefined)).toBe(null);
        expect(mapLineToBackend(null)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "12", ref: "PR2024-001", ref_client: "RC1", socid: "5", fk_soc: "5",
            fk_user_author: "3", datep: "1700000000", datev: "1700000100",
            fin_validite: "1700500000", total_ht: "100.5", total_ttc: "120.6",
            total_tva: "20.1", statut: "1", note_public: "pub", note_private: "priv",
            fk_cond_reglement: "2", fk_mode_reglement: "4", last_main_doc: "propal/PR2024-001/PR2024-001.pdf",
            lines: [
                {
                    id: "7", fk_propal: "12", fk_product: "9", label: "Item", description: "desc",
                    qty: "2", tva_tx: "20", subprice: "50.25", remise_percent: "10",
                    total_ht: "90.45", total_ttc: "108.54", rang: "1", product_type: "0",
                    special_code: "0",
                },
            ],
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 12, ref: "PR2024-001", refClient: "RC1", socid: 5, fkSoc: 5,
            fkUserAuthor: 3, datep: 1700000000, datev: 1700000100,
            finValidite: 1700500000, totalHt: 100.5, totalTtc: 120.6,
            totalTva: 20.1, statut: 1, notePublic: "pub", notePrivate: "priv",
            fkCondReglement: 2, fkModeReglement: 4, lastMainDoc: "propal/PR2024-001/PR2024-001.pdf",
            lines: [
                {
                    id: 7, fkPropal: 12, fkProduct: 9, label: "Item", description: "desc",
                    qty: 2, tvaTx: 20, subprice: 50.25, remisePercent: 10,
                    totalHt: 90.45, totalTtc: 108.54, rang: 1, productType: 0,
                    specialCode: 0,
                },
            ],
        });
    });

    it("reads id from rowid and socid from fk_soc when primary absent (multi-source)", () => {
        const out = mapFromBackend({ rowid: "9", fk_soc: "5", ref: "X" });
        expect(out.id).toBe(9);
        expect(out.socid).toBe(5);
        expect(out.fkSoc).toBe(5);
    });

    it("guarantees a complete, defaulted read shape on a sparse payload", () => {
        const out = mapFromBackend({ ref: "Solo" });
        expect(out.id).toBe(0);
        expect(out.socid).toBe(0);
        expect(out.fkSoc).toBe(0);
        expect(out.notePublic).toBe("");
        expect(out.totalHt).toBe(0);
        expect(out.statut).toBe(0);
        expect(out.lastMainDoc).toBe("");
        expect(out.lines).toEqual([]);
        // 19 front fields: id, ref, refClient, socid, fkSoc, fkUserAuthor, datep,
        // datev, finValidite, totalHt, totalTtc, totalTva, statut, notePublic,
        // notePrivate, fkCondReglement, fkModeReglement, lastMainDoc, lines.
        expect(Object.keys(out)).toHaveLength(19);
    });

    it("collapses a non-array lines payload to [] and drops non-object entries", () => {
        expect(mapFromBackend({ ref: "X", lines: "nope" }).lines).toEqual([]);
        expect(mapFromBackend({ ref: "X", lines: [null, 3, { label: "Keep" }] }).lines).toHaveLength(1);
    });

    it("always writes a complete, defaulted header payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 10 writable header keys.
        const payload = mapToBackend({ refClient: "Solo" });
        expect(Object.keys(payload)).toHaveLength(10);
        expect(payload.ref_client).toBe("Solo");
        expect(payload.socid).toBe(0);
        expect(payload.fk_soc).toBe(0);
        expect(payload.datep).toBe(0);
        expect(payload.datev).toBe(0);
        expect(payload.fin_validite).toBe(0);
        expect(payload.note_public).toBe("");
        expect(payload.note_private).toBe("");
        expect(payload.fk_cond_reglement).toBe(0);
        expect(payload.fk_mode_reglement).toBe(0);
        // empty input still yields the complete defaulted payload
        const empty = mapToBackend({});
        expect(Object.keys(empty)).toHaveLength(10);
        expect(empty.socid).toBe(0);
        expect(empty.ref_client).toBe("");
    });

    it("writes back snake_case without read-only/computed fields", () => {
        const local = {
            id: 12, ref: "PR2024-001", refClient: "RC1", socid: 5, fkSoc: 5,
            fkUserAuthor: 3, datep: 1700000000, datev: 1700000100,
            finValidite: 1700500000, totalHt: 100.5, totalTtc: 120.6,
            totalTva: 20.1, statut: 1, notePublic: "pub", notePrivate: "priv",
            fkCondReglement: 2, fkModeReglement: 4, lastMainDoc: "x.pdf",
            lines: [{ id: 7, label: "Item" }],
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
        // snake_case + coerced
        expect(payload.ref_client).toBe("RC1");
        expect(payload.socid).toBe(5);
        expect(payload.fk_soc).toBe(5);
        expect(payload.fin_validite).toBe(1700500000);
        expect(payload.note_public).toBe("pub");
        expect(payload.fk_cond_reglement).toBe(2);
        expect(Object.keys(payload)).toHaveLength(10);
    });

    it("writes both server keys from a single front field (socid/fk_soc redundancy)", () => {
        // Only fkSoc set front-side: both socid and fk_soc must be written.
        const fromFkSoc = mapToBackend({ fkSoc: 7 });
        expect(fromFkSoc.socid).toBe(7);
        expect(fromFkSoc.fk_soc).toBe(7);
        // Only socid set front-side: both must be written too.
        const fromSocid = mapToBackend({ socid: 9 });
        expect(fromSocid.socid).toBe(9);
        expect(fromSocid.fk_soc).toBe(9);
    });

    it("maps a full line both ways (mapLineFromBackend / mapLineToBackend)", () => {
        const rawLine = {
            id: "7", fk_propal: "12", fk_product: "9", label: "Item", description: "desc",
            qty: "2", tva_tx: "20", subprice: "50.25", remise_percent: "10",
            total_ht: "90.45", total_ttc: "108.54", rang: "1", product_type: "0",
            special_code: "104",
        };
        const localLine = mapLineFromBackend(rawLine);
        expect(localLine).toEqual({
            id: 7, fkPropal: 12, fkProduct: 9, label: "Item", description: "desc",
            qty: 2, tvaTx: 20, subprice: 50.25, remisePercent: 10,
            totalHt: 90.45, totalTtc: 108.54, rang: 1, productType: 0,
            specialCode: 104,
        });
        // 14 read fields on a line.
        expect(Object.keys(localLine)).toHaveLength(14);

        const backLine = mapLineToBackend(localLine);
        // read-only line fields never sent back
        expect(backLine).not.toHaveProperty("id");
        expect(backLine).not.toHaveProperty("fk_propal");
        expect(backLine).not.toHaveProperty("total_ht");
        expect(backLine).not.toHaveProperty("total_ttc");
        // 10 writable line fields, snake_case + coerced.
        expect(backLine).toEqual({
            fk_product: 9, label: "Item", description: "desc",
            qty: 2, tva_tx: 20, subprice: 50.25, remise_percent: 10,
            rang: 1, product_type: 0, special_code: 104,
        });
        expect(Object.keys(backLine)).toHaveLength(10);
    });

    it("reads id from rowid on a line (multi-source)", () => {
        expect(mapLineFromBackend({ rowid: "9", label: "L" }).id).toBe(9);
    });

    it("guarantees a complete, defaulted line shape on both directions", () => {
        const readOut = mapLineFromBackend({ label: "Solo" });
        expect(readOut.id).toBe(0);
        expect(readOut.fkProduct).toBe(0);
        expect(readOut.qty).toBe(0);
        expect(readOut.specialCode).toBe(0);
        expect(Object.keys(readOut)).toHaveLength(14);

        const writeOut = mapLineToBackend({ label: "Solo" });
        expect(Object.keys(writeOut)).toHaveLength(10);
        expect(writeOut.label).toBe("Solo");
        expect(writeOut.fk_product).toBe(0);
        expect(writeOut.qty).toBe(0);
        expect(writeOut.special_code).toBe(0);
        // empty line still yields complete defaulted payload
        expect(Object.keys(mapLineToBackend({}))).toHaveLength(10);
    });
});
