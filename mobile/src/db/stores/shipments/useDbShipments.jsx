import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/shipments";

// Standard CRUD hook for the shipments (Expedition) feature. Pages MUST go
// through this hook instead of calling useApi() directly (cf
// ~/docs/PWA-GUIDELINES.md section 4).
//
// A shipment is created FROM a validated order: create() takes a custom payload
// { originId, lines: [{ entrepotId, fkOriginLine, qty }], ... } and posts the
// snake_case shape the backend expects. There is no blank-form creation.
//
// API exposed (stable contract, mirrors the document hooks):
//   list({ socid, status, page, perPage })   -> Promise<Array<Shipment>>   (legacy)
//   listPaged({ search, sort, order, page,
//               limit, ...filter })           -> Promise<{items,total,page,limit}>
//   count({ search, ...filter })              -> Promise<{total}>
//   columns({ signal })                       -> Promise<Array<ColumnDef>>
//   describe({ signal })                      -> Promise<Object>
//   get(id)                                   -> Promise<Shipment | null>
//   createFromOrder(payload)                  -> Promise<Shipment>
//   update(id, local)                         -> Promise<Shipment>
//   remove(id)                                -> Promise<void>
//   validate / closeShipment / reopen /
//   setDraft / cancel (id)                    -> Promise<Shipment>
//   deleteLine(docId, lineId)                 -> Promise<void>
//   listLinks(id) / removeLink(id, rowid)     -> linked objects (origin order)
export const useDbShipments = () => {
    const { get, post, put, del } = useApi();

    const store = db.instance?.shipments;

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
            const data = await get("shipment", { searchParams });
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
            const data = await get("shipment", { searchParams });
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
            const data = await get("shipment/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("shipment/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        linesColumns: async ({ signal } = {}) => {
            const data = await get("shipment/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("shipment/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        get: async (id) => {
            const raw = await get(`shipment/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Create a shipment from a validated order. `payload` carries the order
        // id and the lines to ship (warehouse + origin order line + quantity).
        createFromOrder: async ({ orderId, lines, dateDelivery, trackingNumber, shippingMethodId, refCustomer, notePublic, notePrivate } = {}) => {
            const json = {
                origin_id: Number(orderId),
                lines: (lines ?? [])
                    .filter((l) => l && Number(l.qty) > 0 && Number(l.fkOriginLine) > 0)
                    .map((l) => ({
                        entrepot_id: Number(l.entrepotId) || 0,
                        fk_origin_line: Number(l.fkOriginLine),
                        qty: Number(l.qty),
                    })),
            };
            if (dateDelivery !== undefined && dateDelivery !== null && dateDelivery !== "") json.date_delivery = dateDelivery;
            if (trackingNumber) json.tracking_number = String(trackingNumber);
            if (shippingMethodId) json.shipping_method_id = Number(shippingMethodId);
            if (refCustomer) json.ref_customer = String(refCustomer);
            if (notePublic) json.note_public = String(notePublic);
            if (notePrivate) json.note_private = String(notePrivate);
            const raw = await post("shipment", { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`shipment/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`shipment/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`shipment/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        closeShipment: async (id) => {
            const raw = await post(`shipment/${id}/close`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        reopen: async (id) => {
            const raw = await post(`shipment/${id}/reopen`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        setDraft: async (id) => {
            const raw = await post(`shipment/${id}/setdraft`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        cancel: async (id) => {
            const raw = await post(`shipment/${id}/cancel`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        deleteLine: async (docId, lineId) => {
            await del(`shipment/${docId}/line/${lineId}`);
        },

        // Linked objects (the origin order chain).
        listLinks: async (id, { signal } = {}) => {
            const data = await get(`shipment/${id}/links`, { signal });
            return Array.isArray(data?.links) ? data.links : [];
        },
        removeLink: async (id, rowid) => {
            await del(`shipment/${id}/link/${rowid}`);
            const data = await get(`shipment/${id}/links`);
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
