import { useEffect, useState } from "react";

import { useApi } from "@cap-rel/smartcommon";

// Cached menu + permissions hook. The backend `home` endpoint returns
// both the navigation tree (sectioned menu items with id/label/icon/route)
// and the user's resolved permission set. We cache the response in
// localStorage with a 1h TTL so the sidebar/bottom nav don't flicker
// between page loads, then revalidate in the background.
//
// Backward compat: if the backend has not been deployed yet (response
// missing `menu` and `permissions`), `menu` falls back to an empty list
// and `has(perm)` defaults to permissive (returns true). The Sidebar /
// MoreMenu render a "Chargement..." skeleton while the menu is null.

const STORAGE_KEY = "dolipocket.menu";
const TTL_MS = 60 * 60 * 1000; // 1 hour

const readCache = () => {
    try {
        if (typeof localStorage === "undefined") return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const { fetchedAt, menu, permissions, plugins } = parsed ?? {};
        if (!fetchedAt || (Date.now() - fetchedAt) > TTL_MS) return null;
        return { menu, permissions, plugins: Array.isArray(plugins) ? plugins : [] };
    } catch (_) {
        return null;
    }
};

const writeCache = (data) => {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ fetchedAt: Date.now(), ...data }),
        );
    } catch (_) {
        // localStorage may be unavailable (private mode, quota, ...).
        // We log silently and keep going - cache is a nice-to-have.
        console.warn("[useMenu] cache write failed");
    }
};

export const useMenu = () => {
    const { get } = useApi();

    const [state, setState] = useState(() => {
        const cached = readCache();
        return cached ?? { menu: null, permissions: null, plugins: [] };
    });
    const [loading, setLoading] = useState(state.menu === null);

    useEffect(() => {
        let cancelled = false;
        get("home")
            .then((data) => {
                if (cancelled) return;
                const next = {
                    menu: Array.isArray(data?.menu) ? data.menu : [],
                    permissions: data?.permissions ?? {},
                    plugins: Array.isArray(data?.plugins) ? data.plugins : [],
                };
                setState(next);
                writeCache(next);
            })
            .catch((err) => {
                // Log every error path so we never have a silent failure.
                console.error("[useMenu] error fetching home menu", err);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    // Permissive when admin OR when permissions payload is missing
    // entirely (backend not deployed yet). An explicit false key is
    // honoured though.
    const has = (perm) => {
        if (!perm) return true;
        const p = state.permissions;
        if (!p || typeof p !== "object") return true; // fallback: permissive
        if (p.admin) return true;
        return Boolean(p[perm]);
    };

    return {
        menu: state.menu,
        permissions: state.permissions,
        // Third-party module remotes advertised by GET /home (Module
        // Federation coordinates). Empty unless a plugin module is active
        // server-side. Consumed by usePluginRoutes() to mount remote routes.
        plugins: state.plugins ?? [],
        loading,
        has,
    };
};
