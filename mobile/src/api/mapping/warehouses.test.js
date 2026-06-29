import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./warehouses";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). The keys,
// coercion, completeness (read AND write) and read-only exclusion must match
// the legacy output exactly.

describe("warehouses mapper (Mapping-backed)", () => {
    it("returns null / empty object on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "12", ref: "ENT-001", label: "Depot principal", description: "stock central",
            lieu: "Hangar A", address: "5 rue Z", zip: "69001", town: "Lyon",
            country_code: "FR", phone: "0411", fax: "0422", statut: "1", fk_parent: "3",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 12, ref: "ENT-001", label: "Depot principal", description: "stock central",
            lieu: "Hangar A", address: "5 rue Z", zip: "69001", town: "Lyon",
            countryCode: "FR", phone: "0411", fax: "0422", statut: 1, fkParent: 3,
        });
    });

    it("reads id from rowid when id is absent (multi-source alias)", () => {
        expect(mapFromBackend({ rowid: "9", label: "X" }).id).toBe(9);
        // primary key wins over alias when both present
        expect(mapFromBackend({ id: "5", rowid: "9" }).id).toBe(5);
    });

    it("guarantees a complete, defaulted READ shape on a sparse payload", () => {
        const out = mapFromBackend({ label: "Solo" });
        expect(out.id).toBe(0);
        expect(out.ref).toBe("");
        expect(out.statut).toBe(1);
        expect(out.fkParent).toBe(0);
        expect(out.description).toBe("");
        expect(out.countryCode).toBe("");
        expect(Object.keys(out)).toHaveLength(13);
    });

    it("always writes a complete, defaulted payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 11 writable keys, defaulted,
        // whatever the input. This is the critical contract.
        const fromEmpty = mapToBackend({});
        expect(Object.keys(fromEmpty)).toHaveLength(11);
        expect(fromEmpty).toEqual({
            label: "", description: "", lieu: "", address: "", zip: "", town: "",
            country_code: "", phone: "", fax: "", statut: 1, fk_parent: 0,
        });

        const fromSingle = mapToBackend({ label: "Solo" });
        expect(Object.keys(fromSingle)).toHaveLength(11);
        expect(fromSingle.label).toBe("Solo");
        expect(fromSingle.description).toBe("");
        expect(fromSingle.statut).toBe(1);
        expect(fromSingle.fk_parent).toBe(0);

        // read-only fields never leak into the write payload
        expect(fromSingle).not.toHaveProperty("id");
        expect(fromSingle).not.toHaveProperty("ref");
    });

    it("writes back snake_case without read-only/computed fields, with coercion", () => {
        const local = {
            id: 12, ref: "ENT-001", label: "Depot principal", description: "stock central",
            lieu: "Hangar A", address: "5 rue Z", zip: "69001", town: "Lyon",
            countryCode: "FR", phone: "0411", fax: "0422", statut: "1", fkParent: "3",
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("ref");
        // snake_case + coerced
        expect(payload.country_code).toBe("FR");
        expect(payload.fk_parent).toBe(3);
        expect(payload.statut).toBe(1);
        expect(payload.label).toBe("Depot principal");
        expect(payload.description).toBe("stock central");
        expect(Object.keys(payload)).toHaveLength(11);
    });
});
