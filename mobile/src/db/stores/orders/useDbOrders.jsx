import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/orders";

// Standard CRUD hook for the orders (Commande client) feature. Pages MUST go
// through this hook instead of calling useApi() directly: this is what makes
// the feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md
// section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ socid, status, page, perPage })   -> Promise<Array<Order>>     (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter})       -> Promise<{items,total,page,limit}>
//   count({search, ...filter})                -> Promise<{total}>
//   columns({ signal })                       -> Promise<Array<ColumnDef>>
//   deleteBulk({ ids })                       -> Promise<{success, errors}>
//   get(id)                                  -> Promise<Order | null>
//   create(local)                            -> Promise<Order>
//   update(id, local)                        -> Promise<Order>
//   remove(id)                               -> Promise<void>
//   validate(id)                             -> Promise<Order>
//   createFromProposal(proposalId)           -> Promise<Order>
//   addLine(docId, line)                     -> Promise<Order>
//   updateLine(docId, lineId, line)          -> Promise<Order>
//   deleteLine(docId, lineId)                -> Promise<void>
//   cacheLocal(item)                         -> Dexie put (single, header only)
//   cacheList(items)                         -> Dexie bulkPut (headers only)
//   readCache({ socid, status })             -> Dexie query (offline)
export const useDbOrders = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.orders;

    // Build a header-only copy for Dexie (lines stay server-side).
    const stripLines = (item) => {
        if (!item) return item;
        const copy = { ...item };
        delete copy.lines;
        return copy;
    };

    return {
        list: async ({ socid, status, page, perPage } = {}) => {
            const searchParams = {};
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.per_page = perPage;
            const data = await get("order", { searchParams });
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
            const data = await get("order", { searchParams });
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

        count: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("order/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("order/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Lines column catalog (read-only descriptor for <DocumentLinesTable>).
        linesColumns: async ({ signal } = {}) => {
            const data = await get("order/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("order/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("order", { json: { ids } })
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
            const raw = await get(`order/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("order", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`order/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`order/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`order/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Generate PDF for the order. Backend returns
        // { ok, file, model } -- forwarded as-is to the caller.
        generatePdf: async (id, opts = {}) => {
            return post(`order/${id}/pdf`, { json: opts });
        },

        // Download the last generated PDF as a Blob (raw response). Cf todo.md task 3.
        downloadPdf: async (id) => {
            const response = await get(`order/${id}/pdf/download`, { raw: true });
            const blob = await response.blob();
            return {
                blob,
                contentDisposition: response.headers.get("Content-Disposition") ?? "",
            };
        },

        // Send the order by email with the last generated PDF attached.
        // Backend POST /order/{id}/send -- cf SendEmailTrait.
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
            return post(`order/${id}/send`, { json });
        },

        createFromProposal: async (proposalId) => {
            const raw = await post(`order/createfromproposal/${proposalId}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        addLine: async (docId, line) => {
            const raw = await post(`order/${docId}/line`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        updateLine: async (docId, lineId, line) => {
            const raw = await put(`order/${docId}/line/${lineId}`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        deleteLine: async (docId, lineId) => {
            await del(`order/${docId}/line/${lineId}`);
        },

        cacheLocal: (item) => (store ? store.put(stripLines(item)) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut((items ?? []).map(stripLines)) : Promise.resolve()),
        readCache: async ({ socid, status } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            }
            if (status !== undefined && status !== null && status !== "") {
                coll = store.where("statut").equals(Number(status));
            }
            return coll.toArray();
        },
    };
};
