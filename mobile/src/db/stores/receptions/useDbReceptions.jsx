import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/receptions";

// Standard CRUD hook for the receptions (Reception) feature. Pages MUST go
// through this hook instead of calling useApi() directly (cf
// ~/docs/PWA-GUIDELINES.md section 4).
//
// A reception is created FROM a supplier order: createFromOrder() takes a
// custom payload { orderId, lines: [{ entrepotId, fkCommandefourndet, qty,
// costPrice? }], ... } and posts the snake_case shape the backend expects.
//
// API exposed (mirrors useDbShipments, supplier-side):
//   list / listPaged / count / columns / describe
//   get / createFromOrder / update / remove
//   validate / closeReception / reopen / setDraft
//   listLinks / removeLink (origin supplier order)
export const useDbReceptions = () => {
    const { get, post, put, del } = useApi();

    const store = db.instance?.receptions;

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
            const data = await get("reception", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped.map(stripLines)).catch(() => undefined);
            }
            return mapped;
        },

        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("reception", { searchParams });
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
            const data = await get("reception/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("reception/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        linesColumns: async ({ signal } = {}) => {
            const data = await get("reception/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("reception/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        get: async (id) => {
            const raw = await get(`reception/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Create a reception from a supplier order. `payload` carries the order
        // id and the lines to receive (warehouse + supplier order line + qty).
        createFromOrder: async ({ orderId, lines, dateDelivery, trackingNumber, shippingMethodId, refSupplier, notePublic, notePrivate } = {}) => {
            const json = {
                origin_id: Number(orderId),
                lines: (lines ?? [])
                    .filter((l) => l && Number(l.qty) > 0 && Number(l.fkCommandefourndet) > 0)
                    .map((l) => {
                        const out = {
                            entrepot_id: Number(l.entrepotId) || 0,
                            fk_commandefourndet: Number(l.fkCommandefourndet),
                            qty: Number(l.qty),
                        };
                        if (l.costPrice !== undefined && l.costPrice !== null && l.costPrice !== "") out.cost_price = Number(l.costPrice);
                        if (l.batch) out.batch = String(l.batch);
                        return out;
                    }),
            };
            if (dateDelivery !== undefined && dateDelivery !== null && dateDelivery !== "") json.date_delivery = dateDelivery;
            if (trackingNumber) json.tracking_number = String(trackingNumber);
            if (shippingMethodId) json.shipping_method_id = Number(shippingMethodId);
            if (refSupplier) json.ref_supplier = String(refSupplier);
            if (notePublic) json.note_public = String(notePublic);
            if (notePrivate) json.note_private = String(notePrivate);
            const raw = await post("reception", { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`reception/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`reception/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`reception/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        closeReception: async (id) => {
            const raw = await post(`reception/${id}/close`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        reopen: async (id) => {
            const raw = await post(`reception/${id}/reopen`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        setDraft: async (id) => {
            const raw = await post(`reception/${id}/setdraft`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Linked objects (the origin supplier order chain).
        listLinks: async (id, { signal } = {}) => {
            const data = await get(`reception/${id}/links`, { signal });
            return Array.isArray(data?.links) ? data.links : [];
        },
        removeLink: async (id, rowid) => {
            await del(`reception/${id}/link/${rowid}`);
            const data = await get(`reception/${id}/links`);
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
