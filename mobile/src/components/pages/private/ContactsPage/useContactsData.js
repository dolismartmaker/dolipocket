import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useStates } from "@cap-rel/smartcommon";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { base64ToBlob, triggerDownload } from "../../../../utils/functions/vcard";

// Shared data layer for ContactsPage (mobile + desktop).
//
// IMPORTANT: data fetching MUST live here, never in *.mobile.jsx or
// *.desktop.jsx (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering").
// This hook returns:
// - everything the mobile view needs (legacy list/search/socid + selection mode)
// - a `dataSource` object the desktop DataTable consumes (count + listPaged + list)
//
// Both views also share `dbContacts` (used for create/update/delete actions).

export const useContactsData = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dbContacts = useDbContacts();

    const socidParam = searchParams.get("socid");
    const socidFilter = socidParam ? Number(socidParam) : null;

    // -- mobile-side state. Untouched from the original index.jsx so the
    // mobile rendering keeps its current behaviour exactly.
    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        q: "",
        page: 1,
        selectionMode: false,
        selectedIds: [],
        exporting: false,
        showImportModal: false,
    });

    const {
        items,
        loading,
        error,
        q,
        page,
        selectionMode,
        selectedIds,
        exporting,
        showImportModal,
    } = states ?? {};

    const hasClient = !!dbContacts.list;

    useEffect(() => {
        if (!hasClient) return;
        loadContacts(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, q, socidFilter]);

    const loadContacts = async (targetPage = 1) => {
        set("loading", true);
        set("error", null);
        try {
            const params = { page: targetPage, perPage: 50 };
            if (q && q.trim().length > 0) params.q = q.trim();
            if (socidFilter) params.socid = socidFilter;
            const rows = await dbContacts.list(params);
            set("items", rows ?? []);
            set("page", targetPage);
        } catch (err) {
            console.error("dbContacts.list error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    // -- desktop-side data source: tells the DataTable how to fetch counts /
    // pages / the full list. The DataTable autonomously decides whether to
    // run in client mode or server mode based on count() (§3 of the spec).
    const dataSource = useMemo(() => ({
        count: (params) => dbContacts.count?.(params) ?? Promise.resolve({ total: 0 }),
        listPaged: (params) => dbContacts.listPaged?.(params)
            ?? Promise.resolve({ items: [], total: 0, page: 1, limit: 50 }),
        // DataTable client mode loads everything via list({}). The legacy
        // `list({})` returns the un-enveloped raw array (cf §4.3).
        list: (params) => dbContacts.list({ ...params, perPage: 5000 }),
        // v2 -- column catalog (cf DATATABLE_SPEC.md §13).
        columns: (opts) => dbContacts.columns?.(opts) ?? Promise.resolve([]),
    // `dbContacts` is a fresh object on every render (useApi returns a new
    // instance), so we intentionally rebuild dataSource. The DataTable pipeline
    // probes once at mount, so this rebuild is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), []);

    return {
        // shared
        navigate,
        dbContacts,
        socidFilter,

        // mobile-only state + handlers
        items,
        loading,
        error,
        q,
        page,
        selectionMode,
        selectedIds,
        exporting,
        showImportModal,
        set,
        loadContacts,
        utils: { base64ToBlob, triggerDownload },

        // desktop-only data source
        dataSource,
    };
};
