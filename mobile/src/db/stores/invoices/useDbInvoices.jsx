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

        // Lines column catalog (read-only descriptor for <DocumentLinesTable>).
        linesColumns: async ({ signal } = {}) => {
            const data = await get("invoice/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("invoice/describe", { signal });
            return data && typeof data === "object" ? data : {};
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

        // Generate PDF for the invoice. Backend returns
        // { ok, file, model } -- forwarded as-is to the caller.
        generatePdf: async (id, opts = {}) => {
            return post(`invoice/${id}/pdf`, { json: opts });
        },

        // Download the last generated PDF as a Blob (raw response). Cf todo.md task 3.
        downloadPdf: async (id) => {
            const response = await get(`invoice/${id}/pdf/download`, { raw: true });
            const blob = await response.blob();
            return {
                blob,
                contentDisposition: response.headers.get("Content-Disposition") ?? "",
            };
        },

        // Record a payment against the invoice. Backend POST
        // /invoice/{id}/payment -- cf PaymentTrait. Body:
        //   {amount, paymentMode, paymentDate (epoch seconds), ref,
        //    fkAccount, note}
        // Returns the backend payload { ok, payment_id, amount, total_paid,
        //   remain_to_pay, paye, invoice }.
        addPayment: async (id, payload = {}) => {
            const json = {};
            if (payload.amount !== undefined) json.amount = Number(payload.amount);
            if (payload.paymentMode !== undefined) json.payment_mode = Number(payload.paymentMode);
            if (payload.paymentDate !== undefined && payload.paymentDate !== "") {
                json.payment_date = Number(payload.paymentDate);
            }
            if (payload.ref !== undefined && payload.ref !== "") json.ref = String(payload.ref);
            if (payload.fkAccount !== undefined && payload.fkAccount > 0) {
                json.fk_account = Number(payload.fkAccount);
            }
            if (payload.note !== undefined) json.note = String(payload.note);
            const res = await post(`invoice/${id}/payment`, { json });
            // The backend response embeds the refreshed `invoice` field --
            // cache it locally so the page state mirrors paye=1 immediately.
            const invoice = res?.invoice ? mapFromBackend(res.invoice) : null;
            if (invoice && store) {
                await store.put(stripCollections(invoice)).catch(() => undefined);
            }
            return { ...res, invoice };
        },

        // Send the invoice by email with the last generated PDF attached.
        // Backend POST /invoice/{id}/send -- cf SendEmailTrait.
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
            return post(`invoice/${id}/send`, { json });
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
