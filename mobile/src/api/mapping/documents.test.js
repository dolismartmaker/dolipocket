import { describe, expect, it } from "vitest";

import { mapFromBackend, mapToBackend } from "./documents";

// Equivalence with the legacy hand-written documents mapper.
// Legacy specifics:
//  - read: 11 camelCase keys. `id` is a SENTINEL: null when absent/0/invalid,
//    the integer otherwise (share is the real primary key for a file).
//  - write: 11 snake_case keys, always complete, `id` via toInt.
//  - filename/path/mime/dates/objectType/objectId read from snake OR camel.

describe("documents mapper (Mapping-backed)", () => {
    it("returns null/{} on non-object input", () => {
        expect(mapFromBackend(null)).toBe(null);
        expect(mapFromBackend(42)).toBe(null);
        expect(mapToBackend(null)).toEqual({});
    });

    it("maps a full server payload to the camelCase front shape with coercion", () => {
        const raw = {
            id: "42", share: "abc123", filename: "facture.pdf", relative_path: "thirdparty/1",
            mime_type: "application/pdf", size: "10240", sha256: "deadbeef",
            date_modification: "1700000100", date_creation: "1700000000",
            object_type: "thirdparty", object_id: "7",
        };
        expect(mapFromBackend(raw)).toEqual({
            id: 42, share: "abc123", name: "facture.pdf", relativePath: "thirdparty/1",
            mime: "application/pdf", size: 10240, sha256: "deadbeef",
            modifiedAt: 1700000100, createdAt: 1700000000, objectType: "thirdparty", objectId: 7,
        });
    });

    it("yields id null when absent, 0 or invalid (legacy sentinel); int otherwise", () => {
        expect(mapFromBackend({ share: "h" }).id).toBe(null);
        expect(mapFromBackend({ id: 0, share: "h" }).id).toBe(null);
        expect(mapFromBackend({ id: "abc", share: "h" }).id).toBe(null);
        expect(mapFromBackend({ id: "9", share: "h" }).id).toBe(9);
        expect(mapFromBackend({ id: 9, share: "h" }).id).toBe(9);
    });

    it("reads filename/path/mime/dates from snake OR already-camel keys", () => {
        const out = mapFromBackend({ share: "h", name: "x.png", relativePath: "p/2", mime: "image/png", modifiedAt: "5", objectType: "product", objectId: "2" });
        expect(out).toMatchObject({ name: "x.png", relativePath: "p/2", mime: "image/png", modifiedAt: 5, objectType: "product", objectId: 2 });
        // snake wins over camel alias when both present
        expect(mapFromBackend({ share: "h", filename: "snake.pdf", name: "camel.pdf" }).name).toBe("snake.pdf");
        // alias source keys do not leak
        expect(out).not.toHaveProperty("relative_path");
    });

    it("guarantees a complete 11-key READ shape on a sparse payload (id null)", () => {
        const out = mapFromBackend({ share: "only" });
        expect(out).toEqual({
            id: null, share: "only", name: "", relativePath: "", mime: "", size: 0,
            sha256: "", modifiedAt: 0, createdAt: 0, objectType: "", objectId: 0,
        });
        expect(Object.keys(out)).toHaveLength(11);
    });

    it("writes back the complete 11-key snake payload (id coerced to int)", () => {
        const local = {
            id: 42, share: "abc123", name: "facture.pdf", relativePath: "thirdparty/1",
            mime: "application/pdf", size: 10240, sha256: "deadbeef", modifiedAt: 1700000100,
            createdAt: 1700000000, objectType: "thirdparty", objectId: 7,
        };
        expect(mapToBackend(local)).toEqual({
            id: 42, share: "abc123", filename: "facture.pdf", relative_path: "thirdparty/1",
            mime_type: "application/pdf", size: 10240, sha256: "deadbeef",
            date_modification: 1700000100, date_creation: 1700000000, object_type: "thirdparty", object_id: 7,
        });
        // a null front id collapses to 0 on the wire (legacy toInt(null))
        expect(mapToBackend({ id: null, share: "h" }).id).toBe(0);
        expect(mapToBackend({ id: "13", share: "h" }).id).toBe(13);
        // camelCase front keys are never sent raw
        expect(mapToBackend(local)).not.toHaveProperty("name");
    });

    it("write payload stays complete (11 keys) on a sparse local", () => {
        const payload = mapToBackend({ share: "x" });
        expect(Object.keys(payload)).toHaveLength(11);
        expect(payload.filename).toBe("");
        expect(payload.object_id).toBe(0);
    });
});
