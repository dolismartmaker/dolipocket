import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/stockMovements";

// Standard CRUD hook for the stock movements feature.
//
// Stock movements are append-only on the backend (Dolibarr keeps them as an
// audit trail), therefore "update" and "remove" are intentionally not
// implemented and reject when called. Reverting a movement is done by
// recording a counter-movement.
//
// API exposed:
//   list({ fkProduct, fkEntrepot, dateFrom, dateTo, page, perPage })
//                                      -> Promise<Array<StockMovement>>
//   get(id)                            -> Promise<StockMovement | null>
//   create(local)                      -> Promise<StockMovement>
//   update(id, local)                  -> Promise.reject (not supported)
//   remove(id)                         -> Promise.reject (not supported)
//   cacheLocal(item)                   -> Dexie put (single)
//   cacheList(items)                   -> Dexie bulkPut
//   readCache({ fkProduct, fkEntrepot }) -> Dexie query (offline)
export const useDbStockMovements = () => {
    const { get, post } = useApi();

    const store = db.instance?.stockMovements;

    return {
        list: async ({ fkProduct, fkEntrepot, dateFrom, dateTo, page, perPage } = {}) => {
            const searchParams = {};
            if (fkProduct !== undefined && fkProduct !== null && fkProduct !== "") {
                searchParams.fk_product = fkProduct;
            }
            if (fkEntrepot !== undefined && fkEntrepot !== null && fkEntrepot !== "") {
                searchParams.fk_entrepot = fkEntrepot;
            }
            if (dateFrom) searchParams.date_from = dateFrom;
            if (dateTo) searchParams.date_to = dateTo;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("stockmovement", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        get: async (id) => {
            const raw = await get(`stockmovement/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("stockmovement", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Stock movements are immutable; reject explicitly so callers cannot
        // accidentally rely on a no-op.
        update: () => Promise.reject(new Error("Stock movements are append-only; update is not supported")),
        remove: () => Promise.reject(new Error("Stock movements are append-only; remove is not supported")),

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ fkProduct, fkEntrepot } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (fkProduct !== undefined && fkProduct !== null && fkProduct !== "") {
                coll = store.where("fkProduct").equals(Number(fkProduct));
            } else if (fkEntrepot !== undefined && fkEntrepot !== null && fkEntrepot !== "") {
                coll = store.where("fkEntrepot").equals(Number(fkEntrepot));
            }
            return coll.toArray();
        },
    };
};
