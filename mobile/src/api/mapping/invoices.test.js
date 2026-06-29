import { describe, expect, it } from "vitest";

import {
    mapFromBackend,
    mapLineFromBackend,
    mapLineToBackend,
    mapPaymentFromBackend,
    mapToBackend,
} from "./invoices";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend (and the line
// and payment helpers) had (commit be25442), now that the mapper is backed by
// the smartcommon Mapping class (standard A). Keys, coercion, the completeness
// contract, read-only exclusion and multi-source socid/fk_soc must match the
// legacy output exactly.

describe("invoices mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
        expect(mapLineFromBackend(null)).toBe(null);
        expect(mapLineToBackend(null)).toEqual({});
        expect(mapPaymentFromBackend(null)).toBe(null);
    });

    // --- (a) full server payload -> exact front shape -------------------------
    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "3", ref: "FA1", ref_client: "RC1", socid: "9", fk_soc: "9", type: "0",
            datef: "1700000000", date_lim_reglement: "1700500000",
            total_ht: "100.5", total_ttc: "120.6", total_tva: "20.1", paye: "1", statut: "2",
            note_public: "np", note_private: "npr", fk_cond_reglement: "1", fk_mode_reglement: "2",
            total_paid: "50.5", remain_to_pay: "70.1", last_main_doc: "facture/FA1/FA1.pdf",
            lines: [{
                id: "11", fk_facture: "3", fk_product: "5", label: "L", description: "D",
                qty: "2", tva_tx: "20", subprice: "50", remise_percent: "0",
                total_ht: "100", total_ttc: "120", rang: "1", product_type: "0", special_code: "0",
            }],
            payments: [{ id: "7", ref: "PMT1", amount: "50.5", date: "1700100000", type: "CB" }],
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 3, ref: "FA1", refClient: "RC1", socid: 9, fkSoc: 9, type: 0,
            datef: 1700000000, dateLimReglement: 1700500000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, paye: 1, statut: 2,
            notePublic: "np", notePrivate: "npr", fkCondReglement: 1, fkModeReglement: 2,
            totalPaid: 50.5, remainToPay: 70.1, lastMainDoc: "facture/FA1/FA1.pdf",
            lines: [{
                id: 11, fkFacture: 3, fkProduct: 5, label: "L", description: "D",
                qty: 2, tvaTx: 20, subprice: 50, remisePercent: 0,
                totalHt: 100, totalTtc: 120, rang: 1, productType: 0, specialCode: 0,
            }],
            payments: [{ id: 7, ref: "PMT1", amount: 50.5, date: 1700100000, type: "CB" }],
        });
    });

    // --- (d) multi-source read via aliases ------------------------------------
    it("reads id from rowid and socid/fkSoc from fk_soc when primary keys are absent", () => {
        const out = mapFromBackend({ rowid: "7", fk_soc: "12", ref: "X" });
        expect(out.id).toBe(7);
        expect(out.socid).toBe(12);
        expect(out.fkSoc).toBe(12);
        // null is treated as absent: fall back to the alias.
        const out2 = mapFromBackend({ socid: null, fk_soc: "8" });
        expect(out2.socid).toBe(8);
        expect(out2.fkSoc).toBe(8);
    });

    it("guarantees a complete, defaulted read shape on a sparse payload (22 keys)", () => {
        const out = mapFromBackend({ ref: "Solo" });
        expect(out.id).toBe(0);
        expect(out.refClient).toBe("");
        expect(out.socid).toBe(0);
        expect(out.fkSoc).toBe(0);
        expect(out.statut).toBe(0);
        expect(out.totalHt).toBe(0);
        expect(out.notePublic).toBe("");
        expect(out.lastMainDoc).toBe("");
        expect(out.lines).toEqual([]);
        expect(out.payments).toEqual([]);
        expect(Object.keys(out)).toHaveLength(22);
    });

    it("collapses a non-array lines/payments to [] and drops non-object entries", () => {
        const out = mapFromBackend({ ref: "FA-Y", lines: "nope", payments: [null, 5, { id: "1" }] });
        expect(out.lines).toEqual([]);
        expect(out.payments).toHaveLength(1);
        expect(out.payments[0].id).toBe(1);
    });

    // --- (b) completeness contract on write (critical) ------------------------
    it("always writes a complete, defaulted header payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 10 writable keys, defaulted.
        const expectedKeys = [
            "date_lim_reglement", "datef", "fk_cond_reglement", "fk_mode_reglement",
            "fk_soc", "note_private", "note_public", "ref_client", "socid", "type",
        ];

        const fromEmpty = mapToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(10);
        expect(Object.keys(fromEmpty).sort()).toEqual(expectedKeys);
        expect(fromEmpty).toEqual({
            ref_client: "", socid: 0, fk_soc: 0, type: 0, datef: 0,
            date_lim_reglement: 0, note_public: "", note_private: "",
            fk_cond_reglement: 0, fk_mode_reglement: 0,
        });

        // A single field provided still yields the full, defaulted payload.
        const fromSparse = mapToBackend({ refClient: "CLI-1" });
        expect(Object.keys(fromSparse)).toHaveLength(10);
        expect(Object.keys(fromSparse).sort()).toEqual(expectedKeys);
        expect(fromSparse).toEqual({
            ref_client: "CLI-1", socid: 0, fk_soc: 0, type: 0, datef: 0,
            date_lim_reglement: 0, note_public: "", note_private: "",
            fk_cond_reglement: 0, fk_mode_reglement: 0,
        });
    });

    // --- (c) read-only fields never written back ------------------------------
    it("writes back snake_case without read-only/computed fields", () => {
        const local = {
            id: 3, ref: "FA1", refClient: "RC1", socid: 9, fkSoc: 9, type: 0,
            datef: 1700000000, dateLimReglement: 1700500000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, paye: 1, statut: 2,
            notePublic: "np", notePrivate: "npr", fkCondReglement: 1, fkModeReglement: 2,
            totalPaid: 50.5, remainToPay: 70.1, lastMainDoc: "facture/FA1/FA1.pdf",
            lines: [{ fkProduct: 5, label: "L", qty: 2 }],
            payments: [{ id: 7, ref: "PMT1" }],
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        for (const k of ["id", "ref", "total_ht", "total_ttc", "total_tva", "paye",
            "statut", "total_paid", "remain_to_pay", "last_main_doc", "lines", "payments"]) {
            expect(payload).not.toHaveProperty(k);
        }
        // snake_case + coerced + socid fanned out to fk_soc
        expect(payload.ref_client).toBe("RC1");
        expect(payload.socid).toBe(9);
        expect(payload.fk_soc).toBe(9);
        expect(payload.note_public).toBe("np");
        expect(payload.note_private).toBe("npr");
        expect(payload.date_lim_reglement).toBe(1700500000);
        expect(payload.fk_cond_reglement).toBe(1);
        expect(payload.fk_mode_reglement).toBe(2);
        expect(Object.keys(payload)).toHaveLength(10);
    });

    // --- (d) multi-source write via writeFrom (socid/fk_soc) ------------------
    it("writes both socid and fk_soc when only fkSoc is provided (write fallback)", () => {
        const payload = mapToBackend({ fkSoc: 7 });
        expect(payload.socid).toBe(7);
        expect(payload.fk_soc).toBe(7);
    });

    it("writes both socid and fk_soc when only socid is provided (write fallback)", () => {
        const payload = mapToBackend({ socid: 5 });
        expect(payload.socid).toBe(5);
        expect(payload.fk_soc).toBe(5);
    });

    // --- (e) lines: both directions + completeness ----------------------------
    it("maps an invoice line in both directions", () => {
        const rawLine = {
            id: "11", fk_facture: "3", fk_product: "5", label: "L", description: "D",
            qty: "2", tva_tx: "20", subprice: "50", remise_percent: "0",
            total_ht: "100", total_ttc: "120", rang: "1", product_type: "0", special_code: "0",
        };
        expect(mapLineFromBackend(rawLine)).toEqual({
            id: 11, fkFacture: 3, fkProduct: 5, label: "L", description: "D",
            qty: 2, tvaTx: 20, subprice: 50, remisePercent: 0,
            totalHt: 100, totalTtc: 120, rang: 1, productType: 0, specialCode: 0,
        });
        // reverse drops read-only id/fk_facture/totals
        const back = mapLineToBackend({
            id: 11, fkFacture: 3, fkProduct: 5, label: "L", description: "D",
            qty: 2, tvaTx: 20, subprice: 50, remisePercent: 0,
            totalHt: 100, totalTtc: 120, rang: 1, productType: 0, specialCode: 104,
        });
        expect(back).not.toHaveProperty("id");
        expect(back).not.toHaveProperty("fk_facture");
        expect(back).not.toHaveProperty("total_ht");
        expect(back).not.toHaveProperty("total_ttc");
        expect(back.fk_product).toBe(5);
        expect(back.tva_tx).toBe(20);
        expect(back.remise_percent).toBe(0);
        expect(back.product_type).toBe(0);
        expect(back.special_code).toBe(104);
        expect(Object.keys(back)).toHaveLength(10);
    });

    it("always writes a complete, defaulted line payload (line completeness contract)", () => {
        // Legacy mapLineToBackend ALWAYS emitted these 10 writable keys, defaulted.
        const fromEmpty = mapLineToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(10);
        expect(Object.keys(fromEmpty).sort()).toEqual([
            "description", "fk_product", "label", "product_type", "qty",
            "rang", "remise_percent", "special_code", "subprice", "tva_tx",
        ]);
        expect(fromEmpty).toEqual({
            fk_product: 0, label: "", description: "", qty: 0, tva_tx: 0,
            subprice: 0, remise_percent: 0, rang: 0, product_type: 0, special_code: 0,
        });
    });

    // --- payments (read-only) -------------------------------------------------
    it("maps a payment from the backend (read-only)", () => {
        expect(mapPaymentFromBackend({ id: "7", ref: "PMT1", amount: "50.5", date: "1700100000", type: "CB" })).toEqual({
            id: 7, ref: "PMT1", amount: 50.5, date: 1700100000, type: "CB",
        });
        // date reads from datep when date is absent (multi-source)
        const out = mapPaymentFromBackend({ rowid: "9", datep: "1700200000" });
        expect(out.id).toBe(9);
        expect(out.date).toBe(1700200000);
    });
});
