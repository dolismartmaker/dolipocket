import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/invoiceRecs";

// Standard CRUD hook for the recurring invoice templates (FactureRec) feature.
// Pages MUST go through this hook instead of calling useApi() directly (cf
// ~/docs/PWA-GUIDELINES.md section 4).
//
// A template is created FROM an invoice (createFromInvoice). "generate" drives
// the native createRecurringInvoices and returns { template, generated }.
//
// API exposed:
//   list / listPaged / count / columns / describe
//   get / createFromInvoice / update / remove
//   generate / suspend / unsuspend
export const useDbInvoiceRecs = () => {
    const { get, post, put, del } = useApi();

    const store = db.instance?.invoiceRecs;

    const stripLines = (item) => {
        if (!item) return item;
        const copy = { ...item };
        delete copy.lines;
        return copy;
    };

    return {
        list: async ({ socid, suspended, page, perPage } = {}) => {
            const searchParams = {};
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (suspended !== undefined && suspended !== null && suspended !== "") searchParams.suspended = suspended;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.per_page = perPage;
            const data = await get("invoicerec", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped.map(stripLines)).catch(() => undefined);
            }
            return mapped;
        },

        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("invoicerec", { searchParams });
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
            const data = await get("invoicerec/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("invoicerec/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("invoicerec/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        get: async (id) => {
            const raw = await get(`invoicerec/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        // Create a recurring template from an existing invoice.
        createFromInvoice: async ({ fkFacture, title, frequency, unitFrequency, dateWhen, nbGenMax, autoValidate, usenewprice } = {}) => {
            const json = {
                fk_facture: Number(fkFacture),
                title: String(title ?? ""),
            };
            if (frequency !== undefined && frequency !== null && frequency !== "") json.frequency = Number(frequency);
            if (unitFrequency) json.unit_frequency = String(unitFrequency);
            if (dateWhen !== undefined && dateWhen !== null && dateWhen !== "") json.date_when = dateWhen;
            if (nbGenMax !== undefined && nbGenMax !== null && nbGenMax !== "") json.nb_gen_max = Number(nbGenMax);
            if (autoValidate !== undefined) json.auto_validate = autoValidate ? 1 : 0;
            if (usenewprice !== undefined) json.usenewprice = usenewprice ? 1 : 0;
            const raw = await post("invoicerec", { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`invoicerec/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`invoicerec/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        // Generate the due invoice(s) now. Returns { template, generated }.
        generate: async (id) => {
            const data = await post(`invoicerec/${id}/generate`);
            const template = mapFromBackend(data?.template);
            if (template && store) {
                await store.put(stripLines(template)).catch(() => undefined);
            }
            return { template, generated: !!data?.generated };
        },

        suspend: async (id) => {
            const raw = await post(`invoicerec/${id}/suspend`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        unsuspend: async (id) => {
            const raw = await post(`invoicerec/${id}/unsuspend`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(stripLines(mapped)).catch(() => undefined);
            }
            return mapped;
        },

        cacheLocal: (item) => (store ? store.put(stripLines(item)) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut((items ?? []).map(stripLines)) : Promise.resolve()),
        readCache: async ({ socid, suspended } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            }
            if (suspended !== undefined && suspended !== null && suspended !== "") {
                coll = store.where("suspended").equals(Number(suspended));
            }
            return coll.toArray();
        },
    };
};
