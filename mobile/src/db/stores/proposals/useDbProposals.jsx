import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/proposals";

// Standard CRUD hook for the proposals (Devis/Propal) feature. Pages MUST go
// through this hook instead of calling useApi() directly: this is what makes
// the feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md
// section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ q, socid, status, page, perPage }) -> Promise<Array<Proposal>> (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter})        -> Promise<{items,total,page,limit}>
//   count({search, ...filter})                 -> Promise<{total}>
//   columns({ signal })                        -> Promise<Array<ColumnDef>>
//   deleteBulk({ ids })                        -> Promise<{success, errors}>
//   get(id)                                    -> Promise<Proposal | null>
//   create(local)                              -> Promise<Proposal>
//   update(id, local)                          -> Promise<Proposal>
//   remove(id)                                 -> Promise<void>
//   validate(id)                               -> Promise<Proposal>
//   closeSigned(id, note)                      -> Promise<Proposal>
//   closeUnsigned(id, note)                    -> Promise<Proposal>
//   addLine(docId, line)                       -> Promise<Proposal>
//   updateLine(docId, lineId, line)            -> Promise<Proposal>
//   deleteLine(docId, lineId)                  -> Promise<void>
//   cacheLocal(item)                           -> Dexie put (single, header only)
//   cacheList(items)                           -> Dexie bulkPut (headers only)
//   readCache({ q, socid, status })            -> Dexie query (offline)
export const useDbProposals = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.proposals;

    // Build a header-only copy for Dexie (lines stay server-side).
    const stripLines = (item) => {
        if (!item) return item;
        const copy = { ...item };
        delete copy.lines;
        return copy;
    };

    return {
        list: async ({ q, socid, status, page, perPage } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.per_page = perPage;
            const data = await get("proposal", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped.map(stripLines)).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable (cf DATATABLE_SPEC.md §4.2).
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("proposal", { searchParams });
            const items = Array.isArray(data?.items)
                ? data.items.map(mapFromBackend).filter(Boolean)
                : [];
            return {
                items,
                total: Number(data?.total ?? 0),
                page: Number(data?.page ?? 1),
                limit: Number(data?.limit ?? 50),
            };
        },

        // Count probe used by the DataTable to decide client-mode vs server-mode.
        count: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("proposal/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        // Column catalog for the DataTable v2 (cf DATATABLE_SPEC.md §13).
        columns: async ({ signal } = {}) => {
            const data = await get("proposal/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Lines column catalog (read-only descriptor for <DocumentLinesTable>).
        linesColumns: async ({ signal } = {}) => {
            const data = await get("proposal/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("proposal/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        // Bulk delete by ids. Server returns {success: [...], errors: [...]}.
        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("proposal", { json: { ids } })
                .json();
            if (store && Array.isArray(data?.success)) {
                await Promise.all(
                    data.success.map((id) => store.delete(Number(id)).catch(() => undefined)),
                );
            }
            return {
                success: Array.isArray(data?.success) ? data.success : [],
                errors: Array.isArray(data?.errors) ? data.errors : [],
            };
        },

        get: async (id) => {
            const raw = await get(`proposal/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("proposal", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`proposal/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`proposal/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`proposal/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Generate PDF for the proposal. Backend returns
        // { ok, file, model } -- forwarded as-is to the caller.
        generatePdf: async (id, opts = {}) => {
            return post(`proposal/${id}/pdf`, { json: opts });
        },

        // Download the last generated PDF as a Blob. Throws when the document
        // has no last_main_doc (404) or the file is missing on disk (410).
        // Caller is responsible for piping the Blob to downloadBlob().
        // Cf todo.md task 3 (Backend stream + Front Blob).
        downloadPdf: async (id) => {
            const response = await get(`proposal/${id}/pdf/download`, { raw: true });
            const blob = await response.blob();
            return {
                blob,
                contentDisposition: response.headers.get("Content-Disposition") ?? "",
            };
        },

        // Send the proposal by email with the last generated PDF attached.
        // Body fields (all strings): to (required, email), subject, body,
        // cc, bcc, attachmentPath (override last_main_doc), ishtml (0|1).
        // Backend POST /proposal/{id}/send -- cf SendEmailTrait.
        sendEmail: async (id, payload = {}) => {
            const json = {};
            if (payload.to !== undefined) json.to = String(payload.to);
            if (payload.cc !== undefined && payload.cc !== "") json.cc = String(payload.cc);
            if (payload.bcc !== undefined && payload.bcc !== "") json.bcc = String(payload.bcc);
            if (payload.subject !== undefined) json.subject = String(payload.subject);
            if (payload.body !== undefined) json.body = String(payload.body);
            if (payload.attachmentPath !== undefined && payload.attachmentPath !== "") {
                json.attachment_path = String(payload.attachmentPath);
            }
            if (payload.ishtml !== undefined) json.ishtml = Number(payload.ishtml) ? 1 : 0;
            return post(`proposal/${id}/send`, { json });
        },

        closeSigned: async (id, note) => {
            const json = {};
            if (note !== undefined && note !== null && note !== "") json.note = String(note);
            const raw = await post(`proposal/${id}/closesign`, { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        closeUnsigned: async (id, note) => {
            const json = {};
            if (note !== undefined && note !== null && note !== "") json.note = String(note);
            const raw = await post(`proposal/${id}/closeunsign`, { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        addLine: async (docId, line) => {
            const raw = await post(`proposal/${docId}/line`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        updateLine: async (docId, lineId, line) => {
            const raw = await put(`proposal/${docId}/line/${lineId}`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        deleteLine: async (docId, lineId) => {
            await del(`proposal/${docId}/line/${lineId}`);
        },

        cacheLocal: (item) => (store ? store.put(stripLines(item)) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut((items ?? []).map(stripLines)) : Promise.resolve()),
        readCache: async ({ q, socid, status } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            }
            if (status !== undefined && status !== null && status !== "") {
                coll = store.where("statut").equals(Number(status));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter(r =>
                    (r.ref ?? "").toLowerCase().includes(needle) ||
                    (r.refClient ?? "").toLowerCase().includes(needle)
                );
            }
            return rows;
        },
    };
};
