import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/products";

// Standard CRUD hook for the products feature. Pages MUST go through this
// hook instead of calling useApi() directly: this is what makes the feature
// portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ q, type, page, perPage })  -> Promise<Array<Product>>      (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter}) -> Promise<{items,total,page,limit}>
//   count({search, ...filter})         -> Promise<{total}>
//   columns({ signal })                -> Promise<Array<ColumnDef>>     (DataTable v2 catalog)
//   deleteBulk({ ids })                -> Promise<{success, errors}>
//   get(id)                           -> Promise<Product | null>
//   create(local)                     -> Promise<Product>
//   update(id, local)                 -> Promise<Product>
//   remove(id)                        -> Promise<void>
//   cacheLocal(item)                  -> Dexie put (single)
//   cacheList(items)                  -> Dexie bulkPut
//   readCache({ q, type })            -> Dexie query (offline)
export const useDbProducts = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.products;

    return {
        list: async ({ q, type, page, perPage } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (type !== undefined && type !== null && type !== "") searchParams.type = type;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("product", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable. Uses the singular
        // endpoint /product (module convention) and the smartmaker
        // filter[col]=val convention (cf DATATABLE_SPEC.md §4.2).
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("product", { searchParams });
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

        // Count probe used by the DataTable to decide between client-mode
        // and server-mode (cf DATATABLE_SPEC.md §3).
        count: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("product/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        // Column catalog for the DataTable v2 (cf DATATABLE_SPEC.md §13).
        columns: async ({ signal } = {}) => {
            const data = await get("product/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("product/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        // Bulk delete by ids. Server returns {success: [...], errors: [...]}.
        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("product", { json: { ids } })
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
            const raw = await get(`product/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("product", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`product/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`product/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        // Read-only product extras (stock by warehouse, supplier purchase
        // prices, multi price levels). Backend routes at the singular
        // /product/{id}/... endpoints. Used by <ProductExtrasSection>.
        getStock: async (id, { signal } = {}) => {
            const data = await get(`product/${id}/stock`, { signal });
            return data && typeof data === "object" ? data : { stockReel: 0, warehouses: [] };
        },
        getSuppliers: async (id, { signal } = {}) => {
            const data = await get(`product/${id}/suppliers`, { signal });
            return Array.isArray(data?.suppliers) ? data.suppliers : [];
        },
        getPrices: async (id, { signal } = {}) => {
            const data = await get(`product/${id}/prices`, { signal });
            return data && typeof data === "object" ? data : { multiEnabled: false, levels: [] };
        },

        // Tier A - A4 - price writing. Each returns the fresh read shape so the
        // caller can refresh without a second request.
        setPrice: async (id, { price, priceBaseType, vatTx, level, minPrice } = {}) => {
            const json = {
                price: Number(price),
                price_base_type: priceBaseType === "TTC" ? "TTC" : "HT",
                vat_tx: Number(vatTx ?? 0),
            };
            if (level !== undefined && level !== null && level !== "") json.level = Number(level);
            if (minPrice !== undefined && minPrice !== null && minPrice !== "") json.min_price = Number(minPrice);
            const data = await post(`product/${id}/price`, { json });
            return data && typeof data === "object" ? data : { multiEnabled: false, levels: [] };
        },

        setSupplierPrice: async (id, { supplierId, refSupplier, qty, buyPrice, priceBaseType, vatTx } = {}) => {
            const json = {
                supplier_id: Number(supplierId),
                ref_supplier: String(refSupplier ?? ""),
                buy_price: Number(buyPrice),
                price_base_type: priceBaseType === "TTC" ? "TTC" : "HT",
                vat_tx: Number(vatTx ?? 0),
            };
            if (qty !== undefined && qty !== null && qty !== "" && Number(qty) > 0) json.qty = Number(qty);
            const data = await post(`product/${id}/supplier-price`, { json });
            return Array.isArray(data?.suppliers) ? data.suppliers : [];
        },

        deleteSupplierPrice: async (id, rowid) => {
            await del(`product/${id}/supplier-price/${rowid}`);
            // Re-read the list so the caller always gets a fresh, parsed shape.
            const data = await get(`product/${id}/suppliers`);
            return Array.isArray(data?.suppliers) ? data.suppliers : [];
        },

        // Tier A - A6a - product variants (read-through, no Dexie cache).
        // Global attributes + their values; mutations return the fresh
        // attributes array. Combinations are per parent product.
        listAttributes: async ({ signal } = {}) => {
            const data = await get("product/attributes", { signal });
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        addAttribute: async ({ ref, label } = {}) => {
            const data = await post("product/attribute", { json: { ref: String(ref ?? ""), label: String(label ?? "") } });
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        updateAttribute: async (id, { ref, label } = {}) => {
            const json = {};
            if (ref !== undefined) json.ref = String(ref);
            if (label !== undefined) json.label = String(label);
            const data = await put(`product/attribute/${id}`, { json });
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        deleteAttribute: async (id) => {
            await del(`product/attribute/${id}`);
            const data = await get("product/attributes");
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        addAttributeValue: async (id, { ref, value } = {}) => {
            const data = await post(`product/attribute/${id}/value`, { json: { ref: String(ref ?? ""), value: String(value ?? "") } });
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        deleteAttributeValue: async (id, valueId) => {
            await del(`product/attribute/${id}/value/${valueId}`);
            const data = await get("product/attributes");
            return Array.isArray(data?.attributes) ? data.attributes : [];
        },
        getCombinations: async (id, { signal } = {}) => {
            const data = await get(`product/${id}/combinations`, { signal });
            return Array.isArray(data?.combinations) ? data.combinations : [];
        },
        addCombination: async (id, { pairs, priceVariation, weightVariation, priceVariationPercent, ref } = {}) => {
            const json = { pairs: Array.isArray(pairs) ? pairs : [] };
            if (priceVariation !== undefined && priceVariation !== null && priceVariation !== "") json.price_variation = Number(priceVariation);
            if (weightVariation !== undefined && weightVariation !== null && weightVariation !== "") json.weight_variation = Number(weightVariation);
            if (priceVariationPercent) json.price_variation_percent = 1;
            if (ref !== undefined && ref !== null && ref !== "") json.ref = String(ref);
            const data = await post(`product/${id}/combination`, { json });
            return Array.isArray(data?.combinations) ? data.combinations : [];
        },
        removeCombination: async (id, rowid) => {
            await del(`product/${id}/combination/${rowid}`);
            const data = await get(`product/${id}/combinations`);
            return Array.isArray(data?.combinations) ? data.combinations : [];
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, type } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (type !== undefined && type !== null && type !== "") {
                coll = store.where("type").equals(Number(type));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter((r) => {
                    const blob = `${r.ref ?? ""} ${r.label ?? ""} ${r.barcode ?? ""}`.toLowerCase();
                    return blob.includes(needle);
                });
            }
            return rows;
        },
    };
};
