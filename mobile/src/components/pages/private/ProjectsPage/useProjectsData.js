import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbProjects } from "src/db/stores/projects/useDbProjects";

// Shared data layer for ProjectsPage (mobile + desktop).

export const useProjectsData = () => {
    const navigate = useNavigate();
    const dbProjects = useDbProjects();
    const hasClient = !!dbProjects.list;

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        status: "",
    });

    const { items, loading, error, q, status } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadList();
        }
    }, [hasClient]);

    const loadList = async () => {
        set("loading", true);
        set("error", null);
        try {
            const params = { perPage: 5000 };
            if (status !== "" && status !== null && status !== undefined) params.status = status;
            const rows = await dbProjects.list(params);
            const needle = (q ?? "").trim().toLowerCase();
            const filtered = needle
                ? rows.filter((r) =>
                    (r.ref ?? "").toLowerCase().includes(needle)
                    || (r.title ?? "").toLowerCase().includes(needle))
                : rows;
            set("items", Array.isArray(filtered) ? filtered : []);
        } catch (err) {
            console.error("dbProjects.list error", err);
            set("error", "Erreur de chargement des projets");
        } finally {
            set("loading", false);
        }
    };

    const dataSource = useMemo(() => ({
        count: (params) => dbProjects.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbProjects.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        list: (params) => dbProjects.list({ ...params, perPage: 5000 }),
        columns: (opts) => dbProjects.columns?.(opts) ?? Promise.resolve([]),
    }), []);

    return {
        navigate,
        dbProjects,
        items,
        loading,
        error,
        q,
        status,
        set,
        loadList,
        dataSource,
    };
};
