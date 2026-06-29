import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./contacts";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). The keys,
// coercion, completeness and read-only exclusion must match the legacy output.
//
// Legacy mapFromBackend emitted 19 front keys (id, lastname, firstname,
// civility, fkSoc, address, zip, town, countryCode, phonePro, phoneMobile, fax,
// email, statut, poste, notePublic, notePrivate, createdAt, updatedAt).
// Legacy mapToBackend ALWAYS emitted the 16 writable snake keys (id/datec/tms
// excluded because they are read-only / server-computed).

describe("contacts mapper (Mapping-backed)", () => {
    it("returns null on non-object input and {} on non-object write", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
        expect(mapToBackend("nope")).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", lastname: "Doe", firstname: "John", civility: "MR", fk_soc: "7",
            address: "1 rue X", zip: "75001", town: "Paris", country_code: "FR",
            phone_pro: "0100", phone_mobile: "0600", fax: "0150", email: "j@d.c",
            statut: "1", poste: "CTO", note_public: "pub", note_private: "priv",
            datec: "1700000000", tms: "1700000100",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, lastname: "Doe", firstname: "John", civility: "MR", fkSoc: 7,
            address: "1 rue X", zip: "75001", town: "Paris", countryCode: "FR",
            phonePro: "0100", phoneMobile: "0600", fax: "0150", email: "j@d.c",
            statut: 1, poste: "CTO", notePublic: "pub", notePrivate: "priv",
            createdAt: 1700000000, updatedAt: 1700000100,
        });
    });

    it("reads id from rowid when id is absent (multi-source alias)", () => {
        expect(mapFromBackend({ rowid: "7", lastname: "X" }).id).toBe(7);
    });

    it("reads civility from civility_code when civility is absent (multi-source alias)", () => {
        expect(mapFromBackend({ civility_code: "MME", lastname: "X" }).civility).toBe("MME");
        // primary key wins over alias when both present
        expect(mapFromBackend({ civility: "MR", civility_code: "MME" }).civility).toBe("MR");
    });

    it("guarantees a complete, defaulted front shape on a sparse payload (read completeness)", () => {
        const out = mapFromBackend({ lastname: "Solo" });
        expect(out.id).toBe(0);
        expect(out.statut).toBe(1);
        expect(out.fkSoc).toBe(0);
        expect(out.firstname).toBe("");
        expect(out.civility).toBe("");
        expect(out.notePublic).toBe("");
        expect(out.notePrivate).toBe("");
        expect(out.createdAt).toBe(0);
        expect(out.updatedAt).toBe(0);
        // 19 front keys, exactly the legacy shape.
        expect(Object.keys(out)).toHaveLength(19);
    });

    it("always writes a complete, defaulted payload (write completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 16 writable keys, defaulted,
        // regardless of how sparse the local object was. This is the critical
        // contract: the server expects a fully-shaped payload, not a partial one.
        const fromSparse = mapToBackend({ lastname: "Solo" });
        expect(Object.keys(fromSparse)).toHaveLength(16);
        expect(fromSparse.lastname).toBe("Solo");
        expect(fromSparse.firstname).toBe("");
        expect(fromSparse.civility).toBe("");
        expect(fromSparse.fk_soc).toBe(0);
        expect(fromSparse.statut).toBe(1);
        expect(fromSparse.note_public).toBe("");

        // Even an empty object yields the full 16-key defaulted payload.
        const fromEmpty = mapToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(16);
        expect(fromEmpty).toEqual({
            lastname: "", firstname: "", civility: "", fk_soc: 0,
            address: "", zip: "", town: "", country_code: "",
            phone_pro: "", phone_mobile: "", fax: "", email: "",
            statut: 1, poste: "", note_public: "", note_private: "",
        });
    });

    it("never writes read-only / server-computed fields back", () => {
        const payload = mapToBackend({
            id: 42, lastname: "Doe", createdAt: 1700000000, updatedAt: 1700000100,
        });
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("rowid");
        expect(payload).not.toHaveProperty("datec");
        expect(payload).not.toHaveProperty("tms");
        expect(payload).not.toHaveProperty("createdAt");
        expect(payload).not.toHaveProperty("updatedAt");
        expect(Object.keys(payload)).toHaveLength(16);
    });

    it("writes back snake_case with coercion from a full local object", () => {
        const local = {
            id: 42, lastname: "Doe", firstname: "John", civility: "MR", fkSoc: "7",
            address: "1 rue X", zip: "75001", town: "Paris", countryCode: "FR",
            phonePro: "0100", phoneMobile: "0600", fax: "0150", email: "j@d.c",
            statut: "1", poste: "CTO", notePublic: "pub", notePrivate: "priv",
            createdAt: 1700000000, updatedAt: 1700000100,
        };
        const payload = mapToBackend(local);
        expect(payload).toEqual({
            lastname: "Doe", firstname: "John", civility: "MR", fk_soc: 7,
            address: "1 rue X", zip: "75001", town: "Paris", country_code: "FR",
            phone_pro: "0100", phone_mobile: "0600", fax: "0150", email: "j@d.c",
            statut: 1, poste: "CTO", note_public: "pub", note_private: "priv",
        });
    });
});
