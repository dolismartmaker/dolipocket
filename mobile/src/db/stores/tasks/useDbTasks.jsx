import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/tasks";

// CRUD hook for the project tasks (Task) feature -- lot B3. Tasks are always
// scoped to a project (?project=<id>). Pages/sections MUST go through this hook
// instead of calling useApi() directly.
//
// API exposed:
//   list({project}) / listPaged / count / columns / describe
//   get / create / update / remove / clone
//   listContacts / addContact / removeContact
export const useDbTasks = () => {
    const { get, post, put, del } = useApi();

    const store = db.instance?.tasks;

    return {
        list: async ({ project, page, perPage } = {}) => {
            const searchParams = {};
            if (project !== undefined && project !== null && project !== "") searchParams.project = project;
            if (page !== undefined) searchParams.page = page;
            if (perPage !== undefined) searchParams.limit = perPage;
            const data = await get("task", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        listPaged: async (params = {}) => {
            const searchParams = { ...params };
            const data = await get("task", { searchParams });
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
            const data = await get("task/count", { searchParams });
            return { total: Number(data?.total ?? 0) };
        },

        columns: async ({ signal } = {}) => {
            const data = await get("task/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        describe: async ({ signal } = {}) => {
            const data = await get("task/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        get: async (id) => {
            const raw = await get(`task/${id}`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        create: async (local) => {
            const raw = await post("task", { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        update: async (id, local) => {
            const raw = await put(`task/${id}`, { json: mapToBackend(local) });
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        remove: async (id) => {
            await del(`task/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        clone: async (id) => {
            const raw = await post(`task/${id}/clone`);
            const mapped = mapFromBackend(raw);
            if (mapped && store) {
                await store.put(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Time spent (timesheet) -- lot B4. Durations are in SECONDS.
        listTime: async (id, { signal } = {}) => {
            const data = await get(`task/${id}/timespent`, { signal });
            return Array.isArray(data?.lines) ? data.lines : [];
        },
        timeSummary: async (id, { signal } = {}) => {
            const data = await get(`task/${id}/timespent/summary`, { signal });
            return data && typeof data === "object" ? data : {};
        },
        addTime: async (id, payload) => {
            const data = await post(`task/${id}/timespent`, { json: payload });
            return Array.isArray(data?.lines) ? data.lines : [];
        },
        updateTime: async (id, tsid, payload) => {
            const data = await put(`task/${id}/timespent/${tsid}`, { json: payload });
            return Array.isArray(data?.lines) ? data.lines : [];
        },
        deleteTime: async (id, tsid) => {
            await del(`task/${id}/timespent/${tsid}`);
            const data = await get(`task/${id}/timespent`);
            return Array.isArray(data?.lines) ? data.lines : [];
        },

        listContacts: async (id, { signal } = {}) => {
            const data = await get(`task/${id}/contacts`, { signal });
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },
        addContact: async (id, { contactId, typeId, source } = {}) => {
            const json = { contact_id: Number(contactId), type_id: Number(typeId) };
            if (source) json.source = String(source);
            return post(`task/${id}/contact`, { json });
        },
        removeContact: async (id, rowid) => {
            await del(`task/${id}/contact/${rowid}`);
            const data = await get(`task/${id}/contacts`);
            return data && typeof data === "object" ? data : { contacts: [], types: [] };
        },
    };
};
