import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./agenda";

// Pins the behaviour the hand-written mapFromBackend/mapToBackend had, now that
// the mapper is backed by the smartcommon Mapping class (standard A). The keys,
// coercion, completeness and read-only exclusion must match the legacy output.
//
// Legacy read shape  : 19 front fields.
// Legacy write shape : 15 server keys (id, ref, fkSoc, updatedAt are read-only).

describe("agenda mapper (Mapping-backed)", () => {
    it("returns null/empty on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(undefined)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
        expect(mapToBackend(undefined)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", ref: "AC42", label: "Call client", type_code: "AC_TEL",
            datep: "1700000000", datef: "1700003600", percentage: "50",
            location: "Bureau", fulldayevent: "0", note: "rappel",
            fk_user_action: "3", fk_user_assigned: "7",
            socid: "9", fk_soc: "9", fk_contact: "11", fk_element: "13",
            elementtype: "project", status: "1", tms: "1700000100",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, ref: "AC42", label: "Call client", typeCode: "AC_TEL",
            datep: 1700000000, datef: 1700003600, percentage: 50,
            location: "Bureau", fulldayevent: 0, note: "rappel",
            fkUserAction: 3, fkUserAssigned: 7,
            socid: 9, fkSoc: 9, fkContact: 11, fkElement: 13,
            elementtype: "project", status: 1, updatedAt: 1700000100,
        });
    });

    it("reads id from rowid when id is absent (multi-source alias)", () => {
        expect(mapFromBackend({ rowid: "7", label: "X" }).id).toBe(7);
    });

    it("reads socid/fkSoc from either source (multi-source aliases)", () => {
        // socid present, fk_soc absent -> both front keys resolve to socid
        const a = mapFromBackend({ socid: "5", label: "X" });
        expect(a.socid).toBe(5);
        expect(a.fkSoc).toBe(5);
        // fk_soc present, socid absent -> both front keys resolve to fk_soc
        const b = mapFromBackend({ fk_soc: "8", label: "X" });
        expect(b.socid).toBe(8);
        expect(b.fkSoc).toBe(8);
    });

    it("guarantees a complete, defaulted read shape on a sparse payload", () => {
        const out = mapFromBackend({ label: "Solo" });
        expect(out.id).toBe(0);
        expect(out.ref).toBe("");
        expect(out.typeCode).toBe("");
        expect(out.datep).toBe(0);
        expect(out.percentage).toBe(0);
        expect(out.status).toBe(0);
        expect(out.note).toBe("");
        expect(out.socid).toBe(0);
        expect(out.fkSoc).toBe(0);
        expect(out.updatedAt).toBe(0);
        // 19 front fields, no alias source keys leaking through.
        expect(Object.keys(out)).toHaveLength(19);
        expect(out).not.toHaveProperty("rowid");
        expect(out).not.toHaveProperty("fk_soc");
    });

    it("always writes a complete, defaulted payload (completeness contract)", () => {
        // The legacy mapToBackend ALWAYS emitted the 15 writable keys, defaulted.
        const sparse = mapToBackend({ label: "Solo" });
        expect(Object.keys(sparse)).toHaveLength(15);
        expect(sparse.label).toBe("Solo");
        expect(sparse.type_code).toBe("");
        expect(sparse.datep).toBe(0);
        expect(sparse.datef).toBe(0);
        expect(sparse.percentage).toBe(0);
        expect(sparse.location).toBe("");
        expect(sparse.fulldayevent).toBe(0);
        expect(sparse.note).toBe("");
        expect(sparse.fk_user_action).toBe(0);
        expect(sparse.fk_user_assigned).toBe(0);
        expect(sparse.socid).toBe(0);
        expect(sparse.fk_contact).toBe(0);
        expect(sparse.fk_element).toBe(0);
        expect(sparse.elementtype).toBe("");
        expect(sparse.status).toBe(0);
        // Even an empty input yields the full defaulted payload.
        const empty = mapToBackend({});
        expect(Object.keys(empty)).toHaveLength(15);
        expect(empty.status).toBe(0);
        expect(empty.label).toBe("");
        expect(empty.socid).toBe(0);
    });

    it("never writes read-only/computed fields back", () => {
        const local = {
            id: 42, ref: "AC42", label: "Call client", typeCode: "AC_TEL",
            datep: 1700000000, datef: 1700003600, percentage: 50,
            location: "Bureau", fulldayevent: 0, note: "rappel",
            fkUserAction: 3, fkUserAssigned: 7,
            socid: 9, fkSoc: 9, fkContact: 11, fkElement: 13,
            elementtype: "project", status: 1, updatedAt: 1700000100,
        };
        const payload = mapToBackend(local);
        // read-only / computed fields never sent back
        expect(payload).not.toHaveProperty("id");
        expect(payload).not.toHaveProperty("rowid");
        expect(payload).not.toHaveProperty("ref");
        expect(payload).not.toHaveProperty("fk_soc");
        expect(payload).not.toHaveProperty("fkSoc");
        expect(payload).not.toHaveProperty("tms");
        expect(payload).not.toHaveProperty("updatedAt");
        // snake_case + coerced canonical keys
        expect(payload.type_code).toBe("AC_TEL");
        expect(payload.fk_user_action).toBe(3);
        expect(payload.fk_user_assigned).toBe(7);
        expect(payload.socid).toBe(9);
        expect(payload.fk_contact).toBe(11);
        expect(payload.fk_element).toBe(13);
        expect(payload.elementtype).toBe("project");
        expect(payload.status).toBe(1);
        expect(Object.keys(payload)).toHaveLength(15);
    });

    it("writes socid from fkSoc fallback (writeFrom: legacy local.socid ?? local.fkSoc)", () => {
        // Only fkSoc provided front-side -> server socid resolves from it.
        const payload = mapToBackend({ label: "X", fkSoc: 7 });
        expect(payload.socid).toBe(7);
        // fk_soc is never emitted (legacy wrote socid only, not fk_soc).
        expect(payload).not.toHaveProperty("fk_soc");
        // socid wins over fkSoc when both are present.
        const both = mapToBackend({ socid: 3, fkSoc: 7 });
        expect(both.socid).toBe(3);
    });
});
