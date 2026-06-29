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

        // Lines column catalog (read-only descriptor for <DocumentLinesTable>).
        linesColumns: async ({ signal } = {}) => {
            const data = await get("supplierinvoice/lines/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("supplierinvoice/describe", { signal });
            return data && typeof data === "object" ? data : {};
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

        setDraft: async (id) => {
            const raw = await post(`supplierinvoice/${id}/setdraft`);
            return cache(mapFromBackend(raw));
        },

        // Classify as paid (status 2). Optional { closeCode, closeNote }.
        setPaid: async (id, { closeCode, closeNote } = {}) => {
            const json = {};
            if (closeCode !== undefined && closeCode !== "") json.close_code = String(closeCode);
            if (closeNote !== undefined && closeNote !== "") json.close_note = String(closeNote);
            const raw = await post(`supplierinvoice/${id}/setpaid`, { json });
            return cache(mapFromBackend(raw));
        },

        setUnpaid: async (id) => {
            const raw = await post(`supplierinvoice/${id}/setunpaid`);
            return cache(mapFromBackend(raw));
        },

        // Duplicate the supplier invoice (Dolibarr createFromClone).
        clone: async (id) => {
            const raw = await post(`supplierinvoice/${id}/clone`);
            return cache(mapFromBackend(raw));
        },

        // Contacts/addresses tab: linked contacts + available types.
        listContacts: async (id, { signal } = {}) => {
            const data = await get(`supplierinvoice/${id}/contacts`, { signal });
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },
        addContact: async (id, { contactId, typeId, source } = {}) => {
            const json = { contact_id: Number(contactId), type_id: Number(typeId) };
            if (source) json.source = String(source);
            return post(`supplierinvoice/${id}/contact`, { json });
        },
        removeContact: async (id, rowid) => {
            await del(`supplierinvoice/${id}/contact/${rowid}`);
            const data = await get(`supplierinvoice/${id}/contacts`);
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },

        // Linked objects (document chain).
        listLinks: async (id, { signal } = {}) => {
            const data = await get(`supplierinvoice/${id}/links`, { signal });
            return Array.isArray(data?.links) ? data.links : [];
        },
        removeLink: async (id, rowid) => {
            await del(`supplierinvoice/${id}/link/${rowid}`);
            const data = await get(`supplierinvoice/${id}/links`);
            return Array.isArray(data?.links) ? data.links : [];
        },

        // Generate PDF for the supplier invoice. Backend returns
        // { ok, file, model } -- forwarded as-is to the caller.
        generatePdf: async (id, opts = {}) => {
            return post(`supplierinvoice/${id}/pdf`, { json: opts });
        },

        // Download the last generated PDF as a Blob (raw response). Cf todo.md task 3.
        downloadPdf: async (id) => {
            const response = await get(`supplierinvoice/${id}/pdf/download`, { raw: true });
            const blob = await response.blob();
            return {
                blob,
                contentDisposition: response.headers.get("Content-Disposition") ?? "",
            };
        },

        // Record a payment against the supplier invoice. Backend POST
        // /supplierinvoice/{id}/payment -- cf PaymentTrait. Body:
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
            const res = await post(`supplierinvoice/${id}/payment`, { json });
            // Cache the refreshed invoice locally so paye flips visibly.
            const invoice = res?.invoice ? mapFromBackend(res.invoice) : null;
            if (invoice && store) {
                await store.put(invoice).catch(() => undefined);
            }
            return { ...res, invoice };
        },

        // Send the supplier invoice by email with the last generated PDF
        // attached. Backend POST /supplierinvoice/{id}/send.
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
            return post(`supplierinvoice/${id}/send`, { json });
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
