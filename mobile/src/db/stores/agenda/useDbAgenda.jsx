import { useApi } from "@cap-rel/smartcommon";

import db from "src/db";
import { mapFromBackend, mapToBackend } from "src/api/mapping/agenda";

// Standard CRUD hook for the agenda (ActionComm) feature. Pages MUST go
// through this hook instead of calling useApi() directly: this is what makes
// the feature portable to another PWA host (cf ~/docs/PWA-GUIDELINES.md
// section 4).
//
// API exposed (stable contract -- mirrors useDbThirdParties + markDone):
//   list({ start, end, fkUserAssigned, socid, q }) -> Promise<Array<Event>>
//   columns({ signal })                            -> Promise<Array<ColumnDef>> (DataTable v2 catalog)
//   describe({ signal })                           -> Promise<objectDescJSON>   (AutoForm catalog)
//   get(id)                                        -> Promise<Event | null>
//   create(local)                                  -> Promise<Event>
//   update(id, local)                              -> Promise<Event>
//   remove(id)                                     -> Promise<void>
//   markDone(id)                                   -> Promise<Event>
//   cacheLocal(item)                               -> Dexie put (single)
//   cacheList(items)                               -> Dexie bulkPut
//   readCache({ q, fkUserAssigned, socid })        -> Dexie query (offline)
export const useDbAgenda = () => {
    const { get, post, put, del } = useApi();

    const store = db.instance?.agenda;

    const cache = async (mapped) => {
        if (mapped && store) {
            await store.put(mapped).catch(() => undefined);
        }
        return mapped;
    };

    return {
        list: async ({
            start, end, fkUserAssigned, socid, q, since,
            type, actioncode, status, usergroup, projectid, resourceid, hideAuto, showbirthday,
        } = {}) => {
            const searchParams = {};
            if (start !== undefined && start !== null && start !== "") searchParams.start = start;
            if (end !== undefined && end !== null && end !== "") searchParams.end = end;
            if (fkUserAssigned !== undefined && fkUserAssigned !== null && fkUserAssigned !== "") {
                searchParams.fk_user_assigned = fkUserAssigned;
            }
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (q) searchParams.q = q;
            // Delta sync: only fetch rows modified since this watermark (unix s).
            if (since !== undefined && since !== null && since !== "" && since > 0) {
                searchParams.since = since;
            }
            // Parity filters (cf docs/AGENDA_FILTERS_SPEC.md). Sent only when set.
            if (type !== undefined && type !== null && type !== "") searchParams.type = type;
            if (actioncode) searchParams.actioncode = actioncode;
            if (status !== undefined && status !== null && status !== "") searchParams.status = status;
            if (usergroup !== undefined && usergroup !== null && usergroup !== "") {
                searchParams.usergroup = usergroup;
            }
            if (projectid !== undefined && projectid !== null && projectid !== "") {
                searchParams.projectid = projectid;
            }
            if (resourceid !== undefined && resourceid !== null && resourceid !== "") {
                searchParams.resourceid = resourceid;
            }
            if (hideAuto) searchParams.hideAuto = 1;
            if (showbirthday) searchParams.showbirthday = 1;
            const data = await get("event", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
        },

        // Column catalog for the DataTable v2 / DocumentHeaderFields. Returns
        // the full list of columns the backend mapper exposes (cf
        // DATATABLE_SPEC.md §13). The endpoint is at the singular noun /event
        // following the module convention.
        columns: async ({ signal } = {}) => {
            const data = await get("event/columns", { signal });
            return Array.isArray(data) ? data : [];
        },

        // Field descriptor for <AutoForm> (objectDesc() raw output). Cf
        // .claude/CLAUDE.md "Lot 9 - Form-from-catalog (AutoForm)".
        describe: async ({ signal } = {}) => {
            const data = await get("event/describe", { signal });
            return data && typeof data === "object" ? data : {};
        },

        // Filter bar options (types + groups + status buckets). Cf
        // docs/AGENDA_FILTERS_SPEC.md section 2.2.
        filterOptions: async ({ signal } = {}) => {
            const data = await get("event/filter-options", { signal });
            return data && typeof data === "object"
                ? { types: [], groups: [], statuses: [], ...data }
                : { types: [], groups: [], statuses: [] };
        },

        // Window-scoped aggregate counts for the preset badges (filter-independent).
        // Cf docs/AGENDA_FILTERS_SPEC.md B-front-3.
        counts: async ({ start, end, signal } = {}) => {
            const searchParams = {};
            if (start !== undefined && start !== null && start !== "") searchParams.start = start;
            if (end !== undefined && end !== null && end !== "") searchParams.end = end;
            const data = await get("event/counts", { searchParams, signal });
            return data && typeof data === "object"
                ? { total: 0, todo: 0, done: 0, overdue: 0, mine: 0, ...data }
                : { total: 0, todo: 0, done: 0, overdue: 0, mine: 0 };
        },

        get: async (id) => {
            const raw = await get(`event/${id}`);
            return cache(mapFromBackend(raw));
        },

        create: async (local) => {
            const raw = await post("event", { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        update: async (id, local) => {
            const raw = await put(`event/${id}`, { json: mapToBackend(local) });
            return cache(mapFromBackend(raw));
        },

        remove: async (id) => {
            await del(`event/${id}`);
            if (store) {
                await store.delete(Number(id)).catch(() => undefined);
            }
        },

        markDone: async (id) => {
            const raw = await post(`event/${id}/done`);
            return cache(mapFromBackend(raw));
        },

        cacheLocal: (item) => (store ? store.put(item) : Promise.resolve()),
        cacheList: (items) => (store ? store.bulkPut(items) : Promise.resolve()),
        readCache: async ({ q, fkUserAssigned, socid } = {}) => {
            if (!store) return [];
            let coll = store.toCollection();
            if (fkUserAssigned !== undefined && fkUserAssigned !== null && fkUserAssigned !== "") {
                coll = store.where("fkUserAssigned").equals(Number(fkUserAssigned));
            } else if (socid !== undefined && socid !== null && socid !== "") {
                coll = store.where("socid").equals(Number(socid));
            }
            let rows = await coll.toArray();
            if (q) {
                const needle = String(q).toLowerCase();
                rows = rows.filter(r => (r.label ?? "").toLowerCase().includes(needle)
                    || (r.location ?? "").toLowerCase().includes(needle));
            }
            return rows;
        },
    };
};
