import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/warehouses";

// Standard CRUD hook for the warehouses feature. Pages MUST go through this
// hook instead of calling useApi() directly: this is what makes the feature
// portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ q, page, perPage })  -> Promise<Array<Warehouse>>           (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter}) -> Promise<{items,total,page,limit}>
//   count({search, ...filter})         -> Promise<{total}>
//   columns({ signal })                -> Promise<Array<ColumnDef>>    (DataTable v2 catalog)
//   deleteBulk({ ids })                -> Promise<{success, errors}>
//   get(id)                     -> Promise<Warehouse | null>
//   create(local)               -> Promise<Warehouse>
//   update(id, local)           -> Promise<Warehouse>
//   remove(id)                  -> Promise<void>
//   cacheLocal(item)            -> Dexie put (single)
//   cacheList(items)            -> Dexie bulkPut
//   readCache({ q })            -> Dexie query (offline)
export const useDbWarehouses = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.warehouses;

    return {
        list: async ({ q, page, perPage } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("warehouse", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable. Uses the singular
        // endpoint /warehouse (cf DATATABLE_SPEC.md §4.2).
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("warehouse", { searchParams });
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
            const data = await get("warehouse/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        // Column catalog for the DataTable v2 (cf DATATABLE_SPEC.md §13).
        columns: async ({ signal } = {}) => {
            const data = await get("warehouse/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Bulk delete by ids. Server returns {success: [...], errors: [...]}.
        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("warehouse", { json: { ids } })
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
            const raw = await get(`warehouse/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("warehouse", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`warehouse/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`warehouse/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q } = {}) => {
            if (!store) return [];
            let rows = await store.toCollection().toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter((r) => {
                    const blob = `${r.ref ?? ""} ${r.label ?? ""} ${r.lieu ?? ""} ${r.town ?? ""}`.toLowerCase();
                    return blob.includes(needle);
                });
            }
            return rows;
        },
    };
};
