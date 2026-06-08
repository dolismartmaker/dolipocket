import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend, mapLineToBackend } from "src/api/mapping/supplierOrders";

// Standard CRUD hook for the supplierOrders feature. Pages MUST go through this
// hook instead of calling useApi() directly: this is what makes the feature
// portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- mirrors useDbThirdParties + workflow extras):
//   list({ q, socid, status })           -> Promise<Array<SupplierOrder>>      (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter})   -> Promise<{items,total,page,limit}>
//   count({search, ...filter})            -> Promise<{total}>
//   columns({ signal })                   -> Promise<Array<ColumnDef>>
//   deleteBulk({ ids })                   -> Promise<{success, errors}>
//   get(id)                              -> Promise<SupplierOrder | null>
//   create(local)                        -> Promise<SupplierOrder>
//   update(id, local)                    -> Promise<SupplierOrder>
//   remove(id)                           -> Promise<void>
//   addLine(id, line)                    -> Promise<SupplierOrder>
//   updateLine(id, lineid, line)         -> Promise<SupplierOrder>
//   deleteLine(id, lineid)               -> Promise<SupplierOrder>
//   validate(id)                         -> Promise<SupplierOrder>
//   approve(id)                          -> Promise<SupplierOrder>
//   order(id, { date, methode, comment }) -> Promise<SupplierOrder>
//   receive(id, { date, type, comment })  -> Promise<SupplierOrder>
//   cacheLocal(item)                     -> Dexie put (single)
//   cacheList(items)                     -> Dexie bulkPut
//   readCache({ q, socid, status })      -> Dexie query (offline)
export const useDbSupplierOrders = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.supplierOrders;

    const cache = async (mapped) => {
        if (mapped && store) {
            await store.put(mapped).catch(() => undefined);
        }
        return mapped;
    };

    return {
        list: async ({ q, socid, status } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            const data = await get("supplierorder", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable (cf DATATABLE_SPEC.md §4.2).
        // The backend endpoint is one word: /supplierorder.
        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("supplierorder", { searchParams });
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
            const data = await get("supplierorder/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("supplierorder/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Lines column catalog (read-only descriptor for <DocumentLinesTable>).
        linesColumns: async ({ signal } = {}) => {
            const data = await get("supplierorder/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("supplierorder/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("supplierorder", { json: { ids } })
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
            const raw = await get(`supplierorder/${id}`);
            return cache(mapFromBackend(raw));
        },

        create: async (local) => {
            const raw = await post("supplierorder", { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        update: async (id, local) => {
            const raw = await put(`supplierorder/${id}`, { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        remove: async (id) => {
            await del(`supplierorder/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        addLine: async (id, line) => {
            const raw = await post(`supplierorder/${id}/line`, { json: mapLineToBackend(line) });
            return cache(mapFromBackend(raw));
        },

        updateLine: async (id, lineid, line) => {
            const raw = await put(`supplierorder/${id}/line/${lineid}`, { json: mapLineToBackend(line) });
            return cache(mapFromBackend(raw));
        },

        deleteLine: async (id, lineid) => {
            const raw = await del(`supplierorder/${id}/line/${lineid}`);
            return cache(mapFromBackend(raw));
        },

        validate: async (id) => {
            const raw = await post(`supplierorder/${id}/validate`);
            return cache(mapFromBackend(raw));
        },

        // Generate PDF for the supplier order. Backend returns
        // { ok, file, model } -- forwarded as-is to the caller.
        generatePdf: async (id, opts = {}) => {
            return post(`supplierorder/${id}/pdf`, { json: opts });
        },

        // Download the last generated PDF as a Blob (raw response). Cf todo.md task 3.
        downloadPdf: async (id) => {
            const response = await get(`supplierorder/${id}/pdf/download`, { raw: true });
            const blob = await response.blob();
            return {
                blob,
                contentDisposition: response.headers.get("Content-Disposition") ?? "",
            };
        },

        // Send the supplier order by email with the last generated PDF
        // attached. Backend POST /supplierorder/{id}/send.
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
            return post(`supplierorder/${id}/send`, { json });
        },

        approve: async (id) => {
            const raw = await post(`supplierorder/${id}/approve`);
            return cache(mapFromBackend(raw));
        },

        order: async (id, { date, methode, comment } = {}) => {
            const json = {};
            if (date !== undefined && date !== null && date !== "") json.date = date;
            if (methode !== undefined && methode !== null && methode !== "") json.methode = methode;
            if (comment !== undefined && comment !== null) json.comment = comment;
            const raw = await post(`supplierorder/${id}/order`, { json });
            return cache(mapFromBackend(raw));
        },

        receive: async (id, { date, type, comment } = {}) => {
            const json = {};
            if (date !== undefined && date !== null && date !== "") json.date = date;
            if (type !== undefined && type !== null && type !== "") json.type = type;
            if (comment !== undefined && comment !== null) json.comment = comment;
            const raw = await post(`supplierorder/${id}/receive`, { json });
            return cache(mapFromBackend(raw));
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, socid, status } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            } else if (status !== undefined && status !== null && status !== "") {
                coll = store.where("statut").equals(Number(status));
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
