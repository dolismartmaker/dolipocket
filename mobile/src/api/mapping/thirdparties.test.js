import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./thirdparties";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). The keys,
// coercion, completeness and read-only exclusion must match the legacy output.

describe("thirdparties mapper (Mapping-backed)", () => {
    it("returns null on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", name: "ACME", name_alias: "acme", code_client: "C1", code_fournisseur: "F1",
            client: "1", fournisseur: "0", address: "1 rue X", zip: "75001", town: "Paris",
            country_code: "FR", phone: "0600", email: "a@b.c", url: "http://x", siren: "123",
            siret: "12345", ape: "6201Z", idprof4: "p4", tva_intra: "FR123",
            note_public: "pub", note_private: "priv", status: "1", datec: "1700000000", tms: "1700000100",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, name: "ACME", nameAlias: "acme", codeClient: "C1", codeFournisseur: "F1",
            client: 1, fournisseur: 0, address: "1 rue X", zip: "75001", town: "Paris",
            countryCode: "FR", phone: "0600", email: "a@b.c", url: "http://x", siren: "123",
            siret: "12345", ape: "6201Z", idprof4: "p4", tvaIntra: "FR123",
            notePublic: "pub", notePrivate: "priv", status: 1, createdAt: 1700000000, updatedAt: 1700000100,
        });
    });

    it("reads id from rowid when id is absent (multi-source)", () => {
        expect(mapFromBackend({ rowid: "7", name: "X" }).id).toBe(7);
    });

    it("guarantees a complete, defaulted shape on a sparse payload", () => {
        const out = mapFromBackend({ name: "Solo" });
        expect(out.id).toBe(0);
        expect(out.status).toBe(1);
        expect(out.notePublic).toBe("");
        expect(out.client).toBe(0);
        expect(Object.keys(out)).toHaveLength(24);
    });

    it("always writes a complete, defaulted payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 21 writable keys, defaulted.
        const payload = mapToBackend({ name: "Solo" });
        expect(Object.keys(payload)).toHaveLength(21);
        expect(payload.name).toBe("Solo");
        expect(payload.name_alias).toBe("");
        expect(payload.client).toBe(0);
        expect(payload.status).toBe(1);
        expect(payload).not.toHaveProperty("id");
        expect(mapToBackend({})).toHaveProperty("status", 1);
    });

    it("writes back snake_case without read-only/computed fields", () => {
        const local = {
            id: 42, name: "ACME", nameAlias: "acme", codeClient: "C1", codeFournisseur: "F1",
            client: 1, fournisseur: 0, address: "1 rue X", zip: "75001", town: "Paris",
            countryCode: "FR", phone: "0600", email: "a@b.c", url: "http://x", siren: "123",
            siret: "12345", ape: "6201Z", idprof4: "p4", tvaIntra: "FR123",
            notePublic: "pub", notePrivate: "priv", status: 1, createdAt: 1700000000, updatedAt: 1700000100,
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("datec");
        expect(payload).not.toHaveProperty("tms");
        // snake_case + coerced
        expect(payload.name_alias).toBe("acme");
        expect(payload.code_client).toBe("C1");
        expect(payload.country_code).toBe("FR");
        expect(payload.note_public).toBe("pub");
        expect(payload.tva_intra).toBe("FR123");
        expect(payload.status).toBe(1);
        expect(Object.keys(payload)).toHaveLength(21);
    });
});
