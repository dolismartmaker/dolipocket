import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/contacts";

// Standard CRUD hook for the contacts feature. Pages MUST go through this
// hook instead of calling useApi() directly: this is what makes the feature
// portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md section 4).
//
// API exposed (stable contract -- other features mirror it):
//   list({ q, socid, page, perPage })  -> Promise<Array<Contact>>      (legacy)
//   listPaged({search, sort, order,
//              page, limit, ...filter}) -> Promise<{items,total,page,limit}>
//   count({search, ...filter})         -> Promise<{total}>
//   columns({ signal })                -> Promise<Array<ColumnDef>>     (DataTable v2 catalog)
//   deleteBulk({ ids })                -> Promise<{success, errors}>
//   get(id)                            -> Promise<Contact | null>
//   create(local)                      -> Promise<Contact>
//   update(id, local)                  -> Promise<Contact>
//   remove(id)                         -> Promise<void>
//   cacheLocal(item)                   -> Dexie put (single)
//   cacheList(items)                   -> Dexie bulkPut
//   readCache({ q, socid })            -> Dexie query (offline)
//   exportVcard(ids)                   -> Promise<{content, content-type, filename}>
//   importVcardFile(file, opts)        -> Promise<importResult> (multipart upload)
//   importVcardPayload(payload)        -> Promise<importResult> (JSON payload)
export const useDbContacts = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.contacts;

    return {
        list: async ({ q, socid, page, perPage } = {}) => {
            const searchParams = {};
            if (q) searchParams.q = q;
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("contact", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Paginated list for the desktop DataTable. Uses the singular
        // endpoint /contact (module convention) and the smartmaker
        // filter[col]=val convention (cf DATATABLE_SPEC.md §4.2). Returns
        // the paginated envelope as-is but maps items via mapFromBackend.
        listPaged: async (params = {}) => {
            // Build a flat object of querystring params. ky's `searchParams`
            // accepts plain objects with `filter[col]` keys -- these are
            // serialised verbatim, no URL-encoding magic on the brackets.
            const searchParams = { ...params };
            const data = await get("contact", { searchParams });
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
            const data = await get("contact/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        // Column catalog for the DataTable v2. Returns the full list of
        // columns the backend mapper exposes (cf DATATABLE_SPEC.md §13).
        columns: async ({ signal } = {}) => {
            const data = await get("contact/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output).
        describe: async ({ signal } = {}) => {
            const data = await get("contact/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        // Bulk delete by ids. Server returns {success: [...], errors: [...]}.
        // We rely on privateApi.delete because ky needs the body via `json`
        // (ApiContext exposes both private and the convenience `del`).
        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("contact", { json: { ids } })
                .json();
            // Best-effort dexie sync: drop rows that the server confirmed.
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
            const raw = await get(`contact/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("contact", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`contact/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`contact/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        // vCard export: returns the raw payload from the backend
        // (shape: { content: base64, "content-type": ..., filename: ... }).
        // Pages decode the base64 themselves to keep this hook free of DOM concerns.
        exportVcard: async (ids) => {
            const idsParam = Array.isArray(ids) ? ids.join(",") : String(ids);
            return await get(`contact/export/vcard?ids=${idsParam}`);
        },

        // vCard import via multipart file upload. Optional fkSoc attaches all
        // imported contacts to the given thirdparty.
        importVcardFile: async (file, { fkSoc, mode = "import" } = {}) => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("mode", mode);
            if (fkSoc) fd.append("fk_soc", String(fkSoc));
            return await post("contact/import/vcard", { body: fd });
        },

        // vCard import via JSON payload (used for preview/import with raw base64).
        // Caller passes the full payload (e.g. { content, mode, fk_soc }).
        importVcardPayload: async (payload) => {
            return await post("contact/import/vcard", { json: payload });
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, socid } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("fkSoc").equals(Number(socid));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter((r) => {
                    const blob = `${r.lastname ?? ""} ${r.firstname ?? ""} ${r.email ?? ""} ${r.phonePro ?? ""} ${r.phoneMobile ?? ""}`.toLowerCase();
                    return blob.includes(needle);
                });
            }
            return rows;
        },
    };
};
