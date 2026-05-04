import { useApi, useUpload } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend } from "src/api/mapping/documents";

// Standard CRUD-like hook for the documents (GED) feature. Pages MUST go
// through this hook instead of calling useApi() directly: this is what makes
// the feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md
// section 4).
//
// The GED feature in Dolipocket relies on:
//   - SmartAuth's ObjectDocumentController for listing and downloads
//     (GET object/{type}/{id}/documents, GET object/{type}/{id}/document...)
//   - SmartAuth's UploadController for binary staging (POST /upload, DELETE
//     /upload/{id})
//   - Dolipocket's own DocumentController for finalising the attachment
//     (POST /document/attach, see ~/docs/UPLOAD_PWA.md and
//     /home/cc/dev/dolipocket/smartmaker-api/DocumentController.php)
//
// API exposed (stable contract -- mirrors other features):
//   list({ objectType, objectId })                 -> Promise<Array<DocumentMeta>>
//   download({ objectType, objectId, share })      -> Promise<{ blob, filename, mime }>
//   downloadBinary({ objectType, objectId, share }) -> Promise<{ blob, filename, mime }>
//   upload({ file, objectType, objectId, filename })
//       Two-step pipeline:
//         1. POST /upload (multipart/form-data) -> upload_id
//         2. POST /document/attach { upload_id, object_type, object_id, filename }
//       Returns the metadata of the freshly attached document
//       (mapped via mapFromBackend) including the share hash. Throws on
//       any step failure; the staged upload is best-effort cancelled when
//       step 2 fails so we don't leak orphan staging entries.
//   cancelUpload(uploadId)                         -> Promise<{ deleted: boolean }>
//   downloadBundle({ objectType, items })          -> Promise<{ blob, filename }>
//
// Local cache (Dexie):
//   cacheLocal(item)            -> store.put(single)
//   cacheList(items)            -> store.bulkPut
//   readCache({ objectType, objectId }) -> Dexie offline read
//   removeCache(share)          -> Dexie delete by primary key
export const useDbDocuments = () => {
    const { get, post, del } = useApi();
    const { uploadFile, cancelUpload: cancelUploadHook } = useUpload();

    const store = db.instance?.documents;

    return {
        list: async ({ objectType, objectId } = {}) => {
            if (!objectType || !objectId) return [];
            const data = await get(`object/${objectType}/${objectId}/documents`);
            const rows = Array.isArray(data?.documents)
                ? data.documents
                : (Array.isArray(data) ? data : []);
            const mapped = rows
                .map(mapFromBackend)
                .filter(Boolean)
                .map((d) => ({
                    ...d,
                    objectType: String(objectType),
                    objectId: Number(objectId),
                }))
                .filter((d) => d.share);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        download: async ({ objectType, objectId, share } = {}) => {
            if (!objectType || !objectId || !share) {
                throw new Error("download: objectType, objectId and share are required");
            }
            const data = await get(`object/${objectType}/${objectId}/document`, {
                searchParams: { q: share },
            });
            if (!data || !data.content) {
                throw new Error("download: empty payload from server");
            }
            const mime = data["content-type"] || data.mime_type || "application/octet-stream";
            const filename = data.filename || "";
            const byteString = atob(data.content);
            const len = byteString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            return { blob, filename, mime };
        },

        downloadBinary: async ({ objectType, objectId, share } = {}) => {
            if (!objectType || !objectId || !share) {
                throw new Error("downloadBinary: objectType, objectId and share are required");
            }
            // ky (wrapped by useApi) does not expose a "raw response" mode in
            // the Dolipocket build, so we fall back to fetch for binary downloads.
            const apiBase = import.meta.env.VITE_API_URL || "";
            const url = `${apiBase.replace(/\/$/, "")}/object/${objectType}/${objectId}/document/binary?q=${encodeURIComponent(share)}`;
            const headers = {};
            const token = (typeof localStorage !== "undefined")
                ? (localStorage.getItem("smartauth_access_token") || localStorage.getItem("access_token") || "")
                : "";
            if (token) headers["Authorization"] = `Bearer ${token}`;
            const res = await fetch(url, { method: "GET", headers });
            if (!res.ok) {
                throw new Error(`downloadBinary: HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const mime = res.headers.get("Content-Type") || "application/octet-stream";
            // Try to extract filename from Content-Disposition.
            let filename = "";
            const cd = res.headers.get("Content-Disposition") || "";
            const m = /filename\*?=(?:UTF-8''|")?([^;"]+)/i.exec(cd);
            if (m && m[1]) filename = decodeURIComponent(m[1]);
            return { blob, filename, mime };
        },

        upload: async ({ file, objectType, objectId, filename } = {}) => {
            if (!file) throw new Error("upload: file is required");
            if (!objectType) throw new Error("upload: objectType is required");
            if (!objectId) throw new Error("upload: objectId is required");

            // Step 1: stage the binary via SmartAuth's POST /upload.
            const staged = await uploadFile(file);
            if (!staged?.upload_id) {
                throw new Error("upload: missing upload_id from /upload response");
            }

            // Step 2: bind the staged blob to the target Dolibarr object
            // through Dolipocket's DocumentController. On failure, cancel the
            // staging entry as a best-effort cleanup.
            const finalName = (filename && String(filename)) || staged.filename || file.name || "upload.bin";
            try {
                const attached = await post("document/attach", {
                    json: {
                        upload_id: staged.upload_id,
                        object_type: String(objectType),
                        object_id: Number(objectId),
                        filename: finalName,
                    },
                });
                const mapped = mapFromBackend(attached) ?? {};
                return {
                    ...mapped,
                    attached: true,
                    objectType: String(objectType),
                    objectId: Number(objectId),
                };
            } catch (err) {
                // Best-effort cleanup so we don't keep an orphaned staging
                // entry until its 1h TTL expires.
                try {
                    await cancelUploadHook(staged.upload_id);
                } catch (cancelErr) {
                    console.error("upload: cancel after attach failure errored", cancelErr);
                }
                throw err;
            }
        },

        cancelUpload: async (uploadId) => {
            if (!uploadId) return { deleted: false };
            // Best-effort: SmartAuth returns {deleted: true} even if the id
            // expired. We surface errors only if the HTTP layer itself fails.
            try {
                const res = await del(`upload/${uploadId}`);
                return { deleted: !!(res?.deleted) };
            } catch (err) {
                // Fall back on the smartcommon helper which is idempotent too.
                try {
                    await cancelUploadHook(uploadId);
                    return { deleted: true };
                } catch {
                    throw err;
                }
            }
        },

        downloadBundle: async ({ objectType, items } = {}) => {
            if (!objectType) throw new Error("downloadBundle: objectType is required");
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error("downloadBundle: items must be a non-empty array");
            }
            const payload = {
                object_type: objectType,
                items: items.map((it) => ({
                    object_id: Number(it.object_id ?? it.objectId),
                    share: String(it.share),
                })),
            };
            // The bundle endpoint may return a ZIP either base64-encoded
            // inside JSON, or as a binary stream. Prefer the JSON path here
            // since useApi() decodes JSON natively.
            const data = await post("object/documents/bundle", { json: payload });
            const mime = data?.["content-type"] || "application/zip";
            const filename = data?.filename || "documents.zip";
            const content = data?.content || "";
            if (!content) {
                throw new Error("downloadBundle: empty payload from server");
            }
            const byteString = atob(content);
            const len = byteString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mime });
            return { blob, filename, mime };
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ objectType, objectId } = {}) => {
            if (!store) return [];
            if (objectType && objectId) {
                return store
                    .where("[objectType+objectId]")
                    .equals([String(objectType), Number(objectId)])
                    .toArray();
            }
            if (objectType) {
                return store.where("objectType").equals(String(objectType)).toArray();
            }
            return store.toArray();
        },
        removeCache: (share) => (store ? store.delete(String(share)) : Promise.resolve()),
    };
};
