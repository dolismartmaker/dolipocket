import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/projects";

// Standard CRUD hook for the projects (Project) feature -- lot B1. Pages MUST
// go through this hook instead of calling useApi() directly (cf
// ~/docs/PWA-GUIDELINES.md section 4).
//
// Endpoints are SINGULAR ('project', 'project/{id}/validate', ...). A project
// is header-only (no document lines), so there is no addLine/updateLine/
// deleteLine/linesColumns here.
//
// API exposed:
//   list / listPaged / count / columns / describe
//   get / create / update / remove / deleteBulk
//   validate / close / reopen / setDraft / clone
//   cacheLocal / cacheList / readCache
export const useDbProjects = () => {
    const { get, post, put, del, private: privateApi } = useApi();

    const store = db.instance?.projects;

    return {
        list: async ({ socid, status, page, perPage } = {}) => {
            const searchParams = {};
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (status !== undefined && status !== null && status !== "") searchParams.filter = { statut: status };
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("project", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("project", { searchParams });
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
            const data = await get("project/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("project/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("project/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        deleteBulk: async ({ ids } = {}) => {
            if (!Array.isArray(ids) || ids.length === 0) {
                return { success: [], errors: [] };
            }
            const data = await privateApi
                .delete("project", { json: { ids } })
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
            const raw = await get(`project/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("project", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`project/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`project/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        validate: async (id) => {
            const raw = await post(`project/${id}/validate`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        close: async (id) => {
            const raw = await post(`project/${id}/close`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        reopen: async (id) => {
            const raw = await post(`project/${id}/reopen`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        setDraft: async (id) => {
            const raw = await post(`project/${id}/setdraft`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        clone: async (id, options = {}) => {
            const json = {};
            if (options.socid) json.socid = Number(options.socid);
            if (options.cloneContacts !== undefined) json.clone_contacts = options.cloneContacts ? 1 : 0;
            if (options.cloneTasks !== undefined) json.clone_tasks = options.cloneTasks ? 1 : 0;
            if (options.cloneNotes !== undefined) json.clone_notes = options.cloneNotes ? 1 : 0;
            if (options.moveDate !== undefined) json.move_date = options.moveDate ? 1 : 0;
            const raw = await post(`project/${id}/clone`, { json });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Contacts / intervenants tab (lot B2). Each call returns
        // { contacts, types } so the UI stays in sync without a manual reload.
        listContacts: async (id, { signal } = {}) => {
            const data = await get(`project/${id}/contacts`, { signal });
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },
        addContact: async (id, { contactId, typeId, source } = {}) => {
            const json = { contact_id: Number(contactId), type_id: Number(typeId) };
            if (source) json.source = String(source);
            return post(`project/${id}/contact`, { json });
        },
        removeContact: async (id, rowid) => {
            await del(`project/${id}/contact/${rowid}`);
            const data = await get(`project/${id}/contacts`);
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },

        // Categories / tags tab (lot B2, TYPE_PROJECT). Each call returns
        // { assigned, available }.
        listCategories: async (id, { signal } = {}) => {
            const data = await get(`project/${id}/categories`, { signal });
            return data && typeof data === "object" ? data : { assigned: [], available: [] };
        },
        addCategory: async (id, { categoryId } = {}) => {
            const json = { category_id: Number(categoryId) };
            return post(`project/${id}/category`, { json });
        },
        removeCategory: async (id, categoryId) => {
            await del(`project/${id}/category/${categoryId}`);
            const data = await get(`project/${id}/categories`);
            return data && typeof data === "object" ? data : { assigned: [], available: [] };
        },

        // PDF generation (lot B5). Returns { message, model, lastMainDoc }.
        generatePdf: async (id) => {
            return post(`project/${id}/generatepdf`);
        },

        // Referents / linked objects tab (lot B2b). Returns an array of groups
        // { type, label, count, items:[{id, ref, route}] }.
        listLinkedObjects: async (id, { signal } = {}) => {
            const data = await get(`project/${id}/elements`, { signal });
            return Array.isArray(data?.groups) ? data.groups : [];
        },
        detachLinkedObject: async (id, type, elementId) => {
            await del(`project/${id}/element/${type}/${elementId}`);
            const data = await get(`project/${id}/elements`);
            return Array.isArray(data?.groups) ? data.groups : [];
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items ?? []) : Promise.resolve()),
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
