import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/invoices";

// Standard CRUD hook for the invoices (Facture client) feature. Pages MUST go
// through this hook instead of calling useApi() directly: this is what makes
// the feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md
// section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ socid, status, paye, page, perPage }) -> Promise<Array<Invoice>> (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter})           -> Promise<{items,total,page,limit}>
//   count({search, ...filter})                    -> Promise<{total}>
//   columns({ signal })                           -> Promise<Array<ColumnDef>>
//   deleteBulk({ ids })                           -> Promise<{success, errors}>
//   get(id)                                       -> Promise<Invoice | null>
//   create(local)                                 -> Promise<Invoice>
//   update(id, local)                             -> Promise<Invoice>
//   remove(id)                                    -> Promise<void>
//   validate(id)                                  -> Promise<Invoice>
//   createFromOrder(orderId)                      -> Promise<Invoice>
//   addLine(docId, line)                          -> Promise<Invoice>
//   updateLine(docId, lineId, line)               -> Promise<Invoice>
//   deleteLine(docId, lineId)                     -> Promise<void>
//   cacheLocal(item)                              -> Dexie put (single, header only)
//   cacheList(items)                              -> Dexie bulkPut (headers only)
//   readCache({ socid, status, paye })            -> Dexie query (offline)
export const useDbInvoices = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.invoices;

    // Build a header-only copy for Dexie (lines and payments stay server-side).
    const stripCollections = (item) => {
        if (!item) return item;
        const copy = { ...item };
        delete copy.lines;
        delete copy.payments;
        return copy;
    };

    return {
        list: async ({ socid, status, paye, page, perPage } = {}) => {
            const searchParams = {};
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            if (paye !== undefined && paye !== null && paye !== "") searchParams.paye = paye;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.per_page = perPage;
            const data = await get("invoice", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped.map(stripCollections)).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable (cf DATATABLE_SPEC.md §4.2).
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("invoice", { searchParams });
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
            const data = await get("invoice/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("invoice/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("invoice", { json: { ids } })
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
            const raw = await get(`invoice/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripCollections(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("invoice", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripCollections(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`invoice/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripCollections(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`invoice/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`invoice/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripCollections(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        createFromOrder: async (orderId) => {
            const raw = await post(`invoice/createfromorder/${orderId}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripCollections(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        addLine: async (docId, line) => {
            const raw = await post(`invoice/${docId}/line`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        updateLine: async (docId, lineId, line) => {
            const raw = await put(`invoice/${docId}/line/${lineId}`, { json: mapLineToBackend(line) });
            return mapFromBackend(raw);
        },

        deleteLine: async (docId, lineId) => {
            await del(`invoice/${docId}/line/${lineId}`);
        },

        cacheLocal: (item) => (store ? store.put(stripCollections(item)) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut((items ?? []).map(stripCollections)) : Promise.resolve()),
        readCache: async ({ socid, status, paye } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            }
            if (status !== undefined && status !== null && status !== "") {
                coll = store.where("statut").equals(Number(status));
            }
            if (paye !== undefined && paye !== null && paye !== "") {
                coll = store.where("paye").equals(Number(paye));
            }
            return coll.toArray();
        },
    };
};
