import { describe, expect, it } from "vitest";

import {
    mapFromBackend,
    mapToBackend,
    mapLineFromBackend,
    mapLineToBackend,
    mapPaymentFromBackend,
} from "./supplierInvoices";

// Equivalence with the legacy hand-written supplierInvoices mapper.
// Legacy specifics:
//  - header read: 25 camelCase keys (incl. lastMainDoc, lines, payments).
//  - header write: ALWAYS 10 scalar keys; `lines` ONLY when present as an array
//    (gated -> omitEmpty); never fk_soc (only socid, from socid ?? fkSoc).
//  - read-only header: id, ref, fkSoc, totals, paye, statut, thirdpartyName,
//    lastMainDoc, payments, totalPaid, remainToPay, updatedAt.
//  - line read: 15 keys (incl. specialCode); line write: 11 keys (incl.
//    special_code); read-only line: id, fkFactureFourn, totalHt, totalTtc.

describe("supplierInvoices line mapper", () => {
    it("maps a line both ways incl. special_code (Lot 11 section discriminant)", () => {
        const raw = {
            id: "501", fk_facture_fourn: "12", fk_product: "7", ref: "P7", label: "Item",
            description: "Desc", qty: "3", tva_tx: "20", subprice: "10", remise_percent: "5",
            total_ht: "28.5", total_ttc: "34.2", rang: "1", product_type: "9", special_code: "104",
        };
        const front = mapLineFromBackend(raw);
        expect(front).toEqual({
            id: 501, fkFactureFourn: 12, fkProduct: 7, ref: "P7", label: "Item",
            description: "Desc", qty: 3, tvaTx: 20, subprice: 10, remisePercent: 5,
            totalHt: 28.5, totalTtc: 34.2, rang: 1, productType: 9, specialCode: 104,
        });
        expect(Object.keys(front)).toHaveLength(15);

        const payload = mapLineToBackend(front);
        expect(payload).toEqual({
            fk_product: 7, ref: "P7", label: "Item", description: "Desc", qty: 3, tva_tx: 20,
            subprice: 10, remise_percent: 5, rang: 1, product_type: 9, special_code: 104,
        });
        expect(Object.keys(payload)).toHaveLength(11);
    });

    it("line completeness: empty line -> complete defaulted payloads", () => {
        expect(Object.keys(mapLineToBackend({}))).toHaveLength(11);
        expect(mapLineToBackend({})).toHaveProperty("special_code", 0);
        expect(Object.keys(mapLineFromBackend({}))).toHaveLength(15);
        expect(mapLineFromBackend({})).toHaveProperty("specialCode", 0);
    });
});

describe("supplierInvoices header mapper", () => {
    it("returns null/{} on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
    });

    it("maps a full server payload (incl. lastMainDoc) to the camelCase shape", () => {
        const raw = {
            id: "12", ref: "FF2401-001", ref_supplier: "SUP-9", socid: "55", fk_soc: "55",
            type: "0", datef: "1700000000", date_lim_reglement: "1700600000",
            total_ht: "100.5", total_ttc: "120.6", total_tva: "20.1", paye: "0", statut: "1",
            note_public: "pub", note_private: "priv", fk_cond_reglement: "1", fk_mode_reglement: "2",
            libelle: "Facture X", thirdparty_name: "ACME SAS", last_main_doc: "fournisseur/FF/FF.pdf",
            total_paid: "30.5", remain_to_pay: "90.1", tms: "1700000100",
            lines: [{ id: "501", fk_product: "7", label: "Item", qty: "3", special_code: "0" }],
            payments: [{ id: "9", date: "1700000050", amount: "30.5", mode_code: "CHQ", mode_label: "Cheque" }],
        };
        const out = mapFromBackend(raw);
        expect(out).toMatchObject({
            id: 12, ref: "FF2401-001", refSupplier: "SUP-9", socid: 55, fkSoc: 55,
            type: 0, datef: 1700000000, dateLimReglement: 1700600000,
            totalHt: 100.5, totalTtc: 120.6, totalTva: 20.1, paye: 0, statut: 1,
            notePublic: "pub", notePrivate: "priv", fkCondReglement: 1, fkModeReglement: 2,
            libelle: "Facture X", thirdpartyName: "ACME SAS", lastMainDoc: "fournisseur/FF/FF.pdf",
            totalPaid: 30.5, remainToPay: 90.1, updatedAt: 1700000100,
        });
        expect(out.lines[0]).toMatchObject({ id: 501, fkProduct: 7, label: "Item", qty: 3, specialCode: 0 });
        expect(out.payments[0]).toEqual({ id: 9, date: 1700000050, amount: 30.5, modeCode: "CHQ", modeLabel: "Cheque" });
        expect(Object.keys(out)).toHaveLength(25);
    });

    it("guarantees a complete 25-key READ shape on a sparse payload", () => {
        const out = mapFromBackend({ ref_supplier: "Solo" });
        expect(out.lastMainDoc).toBe("");
        expect(out.lines).toEqual([]);
        expect(out.payments).toEqual([]);
        expect(Object.keys(out)).toHaveLength(25);
    });

    it("write completeness: 10 scalar keys always; lines omitted when absent", () => {
        const fromEmpty = mapToBackend({});
        expect(fromEmpty).toEqual({
            socid: 0, ref_supplier: "", type: 0, datef: 0, date_lim_reglement: 0,
            note_public: "", note_private: "", fk_cond_reglement: 0, fk_mode_reglement: 0, libelle: "",
        });
        expect(Object.keys(fromEmpty)).toHaveLength(10);
        expect(fromEmpty).not.toHaveProperty("lines");
        // read-only never appears
        expect(mapToBackend({ libelle: "x" })).not.toHaveProperty("statut");
        expect(mapToBackend({ libelle: "x" })).not.toHaveProperty("last_main_doc");
    });

    it("writes lines (mapped, incl. special_code) only when present as an array", () => {
        const withLines = mapToBackend({ libelle: "x", lines: [{ fkProduct: 7, qty: 2, specialCode: 104 }] });
        expect(Object.keys(withLines)).toHaveLength(11);
        expect(withLines.lines).toHaveLength(1);
        expect(withLines.lines[0]).toMatchObject({ fk_product: 7, qty: 2, special_code: 104 });
        // empty array is still emitted (legacy isArray gate accepts [])
        expect(mapToBackend({ libelle: "x", lines: [] }).lines).toEqual([]);
    });

    it("socid from fkSoc writeFrom fallback; never emits fk_soc; excludes read-only", () => {
        const payload = mapToBackend({ fkSoc: 7, libelle: "X" });
        expect(payload.socid).toBe(7);
        expect(payload).not.toHaveProperty("fk_soc");
        expect(mapToBackend({ socid: 3, fkSoc: 9 }).socid).toBe(3);
        expect(mapToBackend({ socid: null, fkSoc: 7 }).socid).toBe(7);
        const full = mapToBackend({ id: 1, ref: "F", statut: 2, totalHt: 9, thirdpartyName: "A", lastMainDoc: "p", socid: 5 });
        ["id", "ref", "fk_soc", "statut", "total_ht", "thirdparty_name", "last_main_doc", "tms", "payments"]
            .forEach((k) => expect(full).not.toHaveProperty(k));
    });

    it("reads a payment line and keeps it read-only", () => {
        expect(mapPaymentFromBackend({ id: "9", date: "1700000050", amount: "30.5", mode_code: "CHQ", mode_label: "Cheque" }))
            .toEqual({ id: 9, date: 1700000050, amount: 30.5, modeCode: "CHQ", modeLabel: "Cheque" });
    });
});
