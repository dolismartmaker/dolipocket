import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/supplierInvoices";

// Standard CRUD hook for the supplierInvoices feature. Pages MUST go through
// this hook instead of calling useApi() directly: this is what makes the
// feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- mirrors useDbThirdParties + workflow extras):
//   list({ q, socid, status, paye })   -> Promise<Array<SupplierInvoice>>     (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter}) -> Promise<{items,total,page,limit}>
//   count({search, ...filter})          -> Promise<{total}>
//   columns({ signal })                 -> Promise<Array<ColumnDef>>
//   deleteBulk({ ids })                 -> Promise<{success, errors}>
//   get(id)                            -> Promise<SupplierInvoice | null>
//   create(local)                      -> Promise<SupplierInvoice>
//   update(id, local)                  -> Promise<SupplierInvoice>
//   remove(id)                         -> Promise<void>
//   addLine(id, line)                  -> Promise<SupplierInvoice>
//   updateLine(id, lineid, line)       -> Promise<SupplierInvoice>
//   deleteLine(id, lineid)             -> Promise<SupplierInvoice>
//   validate(id)                       -> Promise<SupplierInvoice>
//   createFromOrder(orderId)           -> Promise<SupplierInvoice>
//   cacheLocal(item)                   -> Dexie put (single)
//   cacheList(items)                   -> Dexie bulkPut
//   readCache({ q, socid, status, paye }) -> Dexie query (offline)
export const useDbSupplierInvoices = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.supplierInvoices;

    const cache = async (mapped) => {
        if (mapped && store) {
            await store.put(mapped).catch(() => undefined);
        }
        return mapped;
    };

    return {
        list: async ({ q, socid, status, paye } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            if (paye !== undefined && paye !== null && paye !== "") searchParams.paye = paye;
            const data = await get("supplierinvoice", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable (cf DATATABLE_SPEC.md §4.2).
        // The backend endpoint is one word: /supplierinvoice.
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("supplierinvoice", { searchParams });
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
            const data = await get("supplierinvoice/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("supplierinvoice/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("supplierinvoice", { json: { ids } })
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
            const raw = await get(`supplierinvoice/${id}`);
            return cache(mapFromBackend(raw));
        },

        create: async (local) => {
            const raw = await post("supplierinvoice", { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        update: async (id, local) => {
            const raw = await put(`supplierinvoice/${id}`, { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        remove: async (id) => {
            await del(`supplierinvoice/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        addLine: async (id, line) => {
            const raw = await post(`supplierinvoice/${id}/line`, { json: mapLineToBackend(line) });
            return cache(mapFromBackend(raw));
        },

        updateLine: async (id, lineid, line) => {
            const raw = await put(`supplierinvoice/${id}/line/${lineid}`, { json: mapLineToBackend(line) });
            return cache(mapFromBackend(raw));
        },

        deleteLine: async (id, lineid) => {
            const raw = await del(`supplierinvoice/${id}/line/${lineid}`);
            return cache(mapFromBackend(raw));
        },

        validate: async (id) => {
            const raw = await post(`supplierinvoice/${id}/validate`);
            return cache(mapFromBackend(raw));
        },

        createFromOrder: async (orderId) => {
            const raw = await post(`supplierinvoice/createfromorder/${orderId}`);
            return cache(mapFromBackend(raw));
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, socid, status, paye } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            } else if (status !== undefined && status !== null && status !== "") {
                coll = store.where("statut").equals(Number(status));
            } else if (paye !== undefined && paye !== null && paye !== "") {
                coll = store.where("paye").equals(Number(paye));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter(r => (r.ref ?? "").toLowerCase().includes(needle)
                    || (r.refSupplier ?? "").toLowerCase().includes(needle));
            }
            return rows;
        },
    };
};
