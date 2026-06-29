import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/supplierProposals";

// Standard CRUD hook for the supplier price requests (SupplierProposal) feature.
// Supplier-side counterpart of useDbProposals. Pages MUST go through this hook
// instead of calling useApi() directly (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (mirrors the document hooks):
//   list / listPaged / count / columns / linesColumns / describe
//   get / create / update / remove / deleteBulk
//   validate / setDraft / closeSigned / closeUnsigned / reopen / clone
//   addLine / updateLine / deleteLine
//   listLinks / removeLink
export const useDbSupplierProposals = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.supplierProposals;

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
            const data = await get("supplierproposal", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped.map(stripLines)).catch(() => undefined);
            }
            return mapped;
        },

        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("supplierproposal", { searchParams });
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
            const data = await get("supplierproposal/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("supplierproposal/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        linesColumns: async ({ signal } = {}) => {
            const data = await get("supplierproposal/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("supplierproposal/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("supplierproposal", { json: { ids } })
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
            const raw = await get(`supplierproposal/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("supplierproposal", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`supplierproposal/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`supplierproposal/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`supplierproposal/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        setDraft: async (id) => {
            const raw = await post(`supplierproposal/${id}/setdraft`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        closeSigned: async (id, note) => {
            const json = {};
            if (note !== undefined && note !== null && note !== "") json.note = String(note);
            const raw = await post(`supplierproposal/${id}/closesign`, { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        closeUnsigned: async (id, note) => {
            const json = {};
            if (note !== undefined && note !== null && note !== "") json.note = String(note);
            const raw = await post(`supplierproposal/${id}/closeunsign`, { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        reopen: async (id) => {
            const raw = await post(`supplierproposal/${id}/reopen`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        clone: async (id) => {
            const raw = await post(`supplierproposal/${id}/clone`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        addLine: async (docId, line) => {
            const raw = await post(`supplierproposal/${docId}/line`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        updateLine: async (docId, lineId, line) => {
            const raw = await put(`supplierproposal/${docId}/line/${lineId}`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        deleteLine: async (docId, lineId) => {
            await del(`supplierproposal/${docId}/line/${lineId}`);
        },

        listLinks: async (id, { signal } = {}) => {
            const data = await get(`supplierproposal/${id}/links`, { signal });
            return Array.isArray(data?.links) ? data.links : [];
        },
        removeLink: async (id, rowid) => {
            await del(`supplierproposal/${id}/link/${rowid}`);
            const data = await get(`supplierproposal/${id}/links`);
            return Array.isArray(data?.links) ? data.links : [];
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
