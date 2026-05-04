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
        list: async ({ start, end, fkUserAssigned, socid, q } = {}) => {
            const searchParams = {};
            if (start !== undefined && start !== null && start !== "") searchParams.start = start;
            if (end !== undefined && end !== null && end !== "") searchParams.end = end;
            if (fkUserAssigned !== undefined && fkUserAssigned !== null && fkUserAssigned !== "") {
                searchParams.fk_user_assigned = fkUserAssigned;
            }
            if (socid !== undefined && socid !== null && socid !== "") searchParams.socid = socid;
            if (q) searchParams.q = q;
            const data = await get("event", { searchParams });
            const rows = Array.isArray(data) ? data : (data?.items ?? []);
            const mapped = rows.map(mapFromBackend).filter(Boolean);
            if (store) {
                await store.bulkPut(mapped).catch(() => undefined);
            }
            return mapped;
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
