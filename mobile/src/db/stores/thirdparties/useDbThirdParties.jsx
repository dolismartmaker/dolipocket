import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/thirdparties";

// Standard CRUD hook for the thirdparties feature. Pages MUST go through this
// hook instead of calling useApi() directly: this is what makes the feature
// portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ q, client, fournisseur, page, perPage }) -> Promise<Array<ThirdParty>> (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter})              -> Promise<{items,total,page,limit}>
//   count({search, ...filter})                       -> Promise<{total}>
//   columns({ signal })                              -> Promise<Array<ColumnDef>> (DataTable v2 catalog)
//   deleteBulk({ ids })                              -> Promise<{success, errors}>
//   get(id)                                          -> Promise<ThirdParty | null>
//   create(local)                                    -> Promise<ThirdParty>
//   update(id, local)                                -> Promise<ThirdParty>
//   remove(id)                                       -> Promise<void>
//   cacheLocal(item)                                 -> Dexie put (single)
//   cacheList(items)                                 -> Dexie bulkPut
//   readCache({ q, client, fournisseur })            -> Dexie query (offline)
export const useDbThirdParties = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.thirdparties;

    return {
        list: async ({ q, client, fournisseur, page, perPage } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (client !== undefined && client !== null && client !== "") searchParams.client = client;
            if (fournisseur !== undefined && fournisseur !== null && fournisseur !== "") searchParams.fournisseur = fournisseur;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.per_page = perPage;
            const data = await get("thirdparty", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable. Uses the singular
        // endpoint /thirdparty (module convention) and the filter[col]=val
        // convention (cf DATATABLE_SPEC.md §4.2).
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("thirdparty", { searchParams });
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

        // Count probe used by the DataTable to choose client-mode vs server-mode.
        count: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("thirdparty/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        // Column catalog for the DataTable v2. Returns the full list of
        // columns the backend mapper exposes (cf DATATABLE_SPEC.md §13).
        columns: async ({ signal } = {}) => {
            const data = await get("thirdparty/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("thirdparty/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        // Bulk delete by ids. Server returns {success: [...], errors: [...]}.
        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("thirdparty", { json: { ids } })
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
            const raw = await get(`thirdparty/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("thirdparty", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`thirdparty/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`thirdparty/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, client, fournisseur } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (client !== undefined && client !== null && client !== "") {
                coll = store.where("client").equals(Number(client));
            }
            if (fournisseur !== undefined && fournisseur !== null && fournisseur !== "") {
                coll = store.where("fournisseur").equals(Number(fournisseur));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter(r => (r.name ?? "").toLowerCase().includes(needle));
            }
            return rows;
        },
    };
};
