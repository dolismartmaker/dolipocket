import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useApi } from "@cap-rel/smartcommon";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";
import { rangeForView, startOfDay, addDays, addMonths, dateToTs } from "src/lib/calendar";

const localeFor = (lng) => (String(lng || "").startsWith("en") ? "en-US" : "fr-FR");

// Empty filter shape = "Tout" (no facet active). Kept as a factory so each
// consumer/preset gets a fresh object (types is a mutable array).
const emptyFilters = () => ({
    status: "", // '', 'todo', '0', '50', 'done', 'na'
    types: [], // array of type_code strings (actioncode)
    hideAuto: false, // exclude systemauto (journal) events
    showBirthday: false, // inject contact birthdays as virtual events
    assignedToMe: false, // fk_user_assigned = current user
    overdue: false, // client-side: datep < now AND percent < 100
    socid: 0, // third party
    projectid: 0, // project
    usergroup: 0, // assigned-to-group
    resourceid: 0, // resource (room, equipment...)
});

// Live session state (view + active filters) is mirrored to sessionStorage so it
// survives an early remount of the page. RequirePermission unmounts the whole
// route subtree whenever useMenu flips `loading` (initial load + background
// revalidation), which would otherwise discard a view switch or a filter click
// made in the first few hundred ms. Restoring from sessionStorage on mount makes
// the agenda resilient to that (and keeps filters across in-session navigation).
const SESSION_KEY = "dolipocket.agenda.session";
const loadSession = () => {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}") || {};
    } catch {
        return {};
    }
};
const persistSession = (data) => {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (err) {
        console.error("[useAgendaData] persistSession error", err);
    }
};

// Saved views persistence (B-front-3b). A saved view is a named snapshot of the
// filter state, stored in localStorage so it survives reloads.
const SAVED_VIEWS_KEY = "dolipocket.agenda.savedViews";
const loadSavedViews = () => {
    try {
        const arr = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
};
const persistSavedViews = (views) => {
    try {
        localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
    } catch (err) {
        console.error("[useAgendaData] persistSavedViews error", err);
    }
};

// Named preset combos surfaced as one-click chips in the filter bar.
const PRESETS = {
    all: emptyFilters,
    mine: () => ({ ...emptyFilters(), assignedToMe: true }),
    todo: () => ({ ...emptyFilters(), status: "todo" }),
    overdue: () => ({ ...emptyFilters(), overdue: true }),
    done: () => ({ ...emptyFilters(), status: "done" }),
};

// Which preset (if any) the current filter state matches, for chip highlight.
const matchPreset = (f) => {
    const keys = Object.keys(PRESETS);
    for (const name of keys) {
        const p = PRESETS[name]();
        if (
            p.status === f.status &&
            p.hideAuto === f.hideAuto &&
            p.showBirthday === f.showBirthday &&
            p.assignedToMe === f.assignedToMe &&
            p.overdue === f.overdue &&
            f.types.length === 0 &&
            f.socid === 0 &&
            f.projectid === 0 &&
            f.usergroup === 0 &&
            f.resourceid === 0
        ) {
            return name;
        }
    }
    return null;
};

// Data + interaction hook shared by the mobile and desktop agenda calendars.
// Owns: current view, navigation cursor, the events of the visible range, and
// every handler the <Calendar> needs. Presentational views stay pure.
//
// availableViews / defaultView are provided by the viewport-specific page so
// the mobile shell can drop the cramped week time-grid.
export const useAgendaData = ({ availableViews, defaultView = "month" } = {}) => {
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const { user } = useApi();
    const { t, i18n } = useTranslation("agenda");
    const locale = localeFor(i18n.language);

    const currentUserId = user?.id ? Number(user.id) : 0;

    // Restore view + filters from the session mirror (survives early remounts).
    const sessionRef = useRef(loadSession());
    const [view, setView] = useState(() => {
        const v = sessionRef.current.view;
        return v && (!availableViews || availableViews.includes(v)) ? v : defaultView;
    });
    const [cursor, setCursor] = useState(() => startOfDay(new Date()));
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState(() => {
        const f = sessionRef.current.filters;
        return f && typeof f === "object"
            ? { ...emptyFilters(), ...f, types: Array.isArray(f.types) ? [...f.types] : [] }
            : emptyFilters();
    });
    const [filterOptions, setFilterOptions] = useState({ types: [], groups: [], statuses: [] });
    const [savedViews, setSavedViews] = useState(loadSavedViews);
    // Window-scoped, filter-independent counts for the preset badges.
    const [counts, setCounts] = useState({ total: 0, todo: 0, done: 0, overdue: 0, mine: 0 });
    const [countsVersion, setCountsVersion] = useState(0);

    // Delta-sync watermark: the max `updatedAt` (tms) seen so far. A focus
    // revalidation fetches only rows changed since this instant (?since=),
    // instead of re-downloading the whole window (cf OPTI-DATA-ACCESS.md).
    const lastSyncRef = useRef(0);

    const hasClient = !!dbAgenda.list;
    const cursorTime = cursor.getTime();

    // Visible range (unix seconds) for the current view/cursor. The List view
    // uses it to clamp out the backend's "no end date" events that predate the
    // window (datep2 NULL has no lower bound server-side).
    const range = useMemo(() => rangeForView(view, cursor), [view, cursorTime]);

    // Mirror view + filters to sessionStorage so an early remount restores them.
    useEffect(() => {
        persistSession({ view, filters });
    }, [view, filters]);

    // Server-side filter params (everything except `overdue`, which is derived
    // client-side). Stringified into a stable key used as an effect dep so a
    // filter change re-runs the (now single-query) load.
    const serverParams = useMemo(() => {
        const p = {};
        if (filters.status) p.status = filters.status;
        if (filters.types.length) p.actioncode = filters.types.join(",");
        if (filters.hideAuto) p.hideAuto = 1;
        if (filters.showBirthday) p.showbirthday = 1;
        if (filters.assignedToMe && currentUserId) p.fk_user_assigned = currentUserId;
        if (filters.socid) p.socid = filters.socid;
        if (filters.projectid) p.projectid = filters.projectid;
        if (filters.usergroup) p.usergroup = filters.usergroup;
        if (filters.resourceid) p.resourceid = filters.resourceid;
        return p;
    }, [
        filters.status, filters.types, filters.hideAuto, filters.showBirthday, filters.assignedToMe,
        filters.socid, filters.projectid, filters.usergroup, filters.resourceid, currentUserId,
    ]);
    const serverKey = useMemo(() => JSON.stringify(serverParams), [serverParams]);

    // Apply the client-only `overdue` facet on top of the server result.
    const displayedEvents = useMemo(() => {
        if (!filters.overdue) return events;
        const now = Math.floor(Date.now() / 1000);
        return events.filter((e) => (e.datep || 0) < now && (e.percentage ?? 0) < 100);
    }, [events, filters.overdue]);

    // Lightweight counters for the toolbar (over the visible, filtered range).
    const stats = useMemo(() => {
        const list = displayedEvents || [];
        const todo = list.filter((ev) => (ev.percentage ?? 0) < 100).length;
        return { total: list.length, todo, done: list.length - todo };
    }, [displayedEvents]);

    // Filter options (types + groups + status buckets) -- loaded once.
    useEffect(() => {
        if (!dbAgenda.filterOptions) return undefined;
        let cancelled = false;
        dbAgenda
            .filterOptions()
            .then((opts) => {
                if (!cancelled && opts) setFilterOptions(opts);
            })
            .catch((err) => console.error("[useAgendaData] filterOptions error", err));
        return () => {
            cancelled = true;
        };
    }, [hasClient]);

    // Preset count badges for the current window (independent of active facets).
    useEffect(() => {
        if (!dbAgenda.counts) return undefined;
        let cancelled = false;
        const { start, end } = range;
        dbAgenda
            .counts({ start, end })
            .then((c) => {
                if (!cancelled && c) setCounts(c);
            })
            .catch((err) => console.error("[useAgendaData] counts error", err));
        return () => {
            cancelled = true;
        };
    }, [hasClient, range, countsVersion]);

    useEffect(() => {
        if (!hasClient) return undefined;
        let cancelled = false;
        const { start, end } = range;
        setLoading(true);
        setError(null);
        dbAgenda
            .list({ start, end, ...serverParams })
            .then((rows) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                setEvents(list);
                // Reset the delta watermark to this full snapshot.
                lastSyncRef.current = list.reduce(
                    (max, ev) => Math.max(max, ev.updatedAt || 0),
                    0,
                );
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[useAgendaData] dbAgenda.list error", err);
                setError(t("toasts.load-error", "Impossible de charger les événements"));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [hasClient, range, serverKey]);

    // Delta revalidation for the CURRENT window: fetch only rows modified since
    // the last watermark and merge them by id (never wipes the list, so a dense
    // window can't drop rows). Deletions are handled locally on remove + by the
    // full reload on navigation. Cheap enough to run on tab focus.
    const refresh = useCallback(async () => {
        if (!hasClient) return;
        const since = lastSyncRef.current;
        if (!since) return; // no baseline yet -> the main effect owns the first load
        const { start, end } = range;
        try {
            const rows = await dbAgenda.list({ start, end, since, ...serverParams });
            if (!Array.isArray(rows) || rows.length === 0) return;
            setEvents((prev) => {
                const byId = new Map(prev.map((e) => [e.id, e]));
                rows.forEach((ev) => byId.set(ev.id, ev));
                return Array.from(byId.values());
            });
            lastSyncRef.current = rows.reduce(
                (max, ev) => Math.max(max, ev.updatedAt || 0),
                lastSyncRef.current,
            );
        } catch (err) {
            console.error("[useAgendaData] refresh (delta) error", err);
        }
    }, [hasClient, range, serverKey]);

    useEffect(() => {
        const onFocus = () => refresh();
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [refresh]);

    const step = useCallback(
        (dir) => {
            setCursor((prev) => {
                if (view === "day") return addDays(prev, dir);
                if (view === "week") return addDays(prev, dir * 7);
                return addMonths(prev, dir); // month + list
            });
        },
        [view],
    );

    const onPrev = useCallback(() => step(-1), [step]);
    const onNext = useCallback(() => step(1), [step]);
    const onToday = useCallback(() => setCursor(startOfDay(new Date())), []);
    const onViewChange = useCallback((v) => setView(v), []);

    // Virtual events (birthdays) carry a negative id and have no real
    // ActionComm behind them -> non-navigable, non-editable.
    const onSelectEvent = useCallback((id) => {
        if (Number(id) < 0) return;
        navigate(`/agenda/${id}`);
    }, [navigate]);

    // Drill-in: clicking a month cell focuses that day in the Day view.
    const onSelectDay = useCallback((day) => {
        setCursor(startOfDay(day));
        setView("day");
    }, []);

    // Create prefilled with the clicked slot, or the cursor day at 09:00.
    const createAt = useCallback(
        (date) => {
            const d =
                date ||
                new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 9, 0, 0);
            navigate(`/agenda/new?datep=${dateToTs(d)}`);
        },
        [cursor, navigate],
    );

    const onSelectSlot = useCallback((date) => createAt(date), [createAt]);
    const onCreate = useCallback(() => createAt(null), [createAt]);

    // Quick create via modal: create event and return {id}. The POST returns
    // the fresh event -> insert it locally by id instead of reloading the whole
    // window (cf OPTI-DATA-ACCESS.md anti-pattern C).
    const onCreateEvent = useCallback(
        async (payload) => {
            try {
                const result = await dbAgenda.create(payload);
                if (result?.id) {
                    setEvents((prev) => [
                        ...prev.filter((e) => e.id !== result.id),
                        result,
                    ]);
                    if (result.updatedAt) {
                        lastSyncRef.current = Math.max(lastSyncRef.current, result.updatedAt);
                    }
                    setCountsVersion((v) => v + 1);
                }
                return result;
            } catch (err) {
                console.error("[useAgendaData] onCreateEvent error", err);
                throw err;
            }
        },
        [dbAgenda],
    );

    // Drag-and-drop reschedule from the week/day time grid. `datep`/`datef`
    // arrive in unix SECONDS (the grid computes them from the drop slot). We
    // send the FULL current event merged with the new dates: mapToBackend
    // backfills every field with its default, so a partial patch would wipe
    // label/thirdparty/owner. Optimistic update for instant feedback, then
    // patch in the server-truth event from the PUT response -- NO full window
    // reload. The old reload re-ran ~400 queries AND could drop the moved event
    // when the window held more rows than the server LIMIT, making it look
    // "not moved" (cf OPTI-DATA-ACCESS.md anti-patterns B + C).
    const onMoveEvent = useCallback(
        async (id, { datep, datef }) => {
            if (Number(id) < 0) return; // virtual birthday: not movable
            const current = (events || []).find((e) => e.id === id);
            if (!current) {
                console.error("[useAgendaData] onMoveEvent: event not found", id);
                return;
            }
            setEvents((prev) =>
                prev.map((e) => (e.id === id ? { ...e, datep, datef } : e)),
            );
            try {
                const fresh = await dbAgenda.update(id, { ...current, datep, datef });
                if (fresh?.id) {
                    setEvents((prev) => prev.map((e) => (e.id === id ? fresh : e)));
                    if (fresh.updatedAt) {
                        lastSyncRef.current = Math.max(lastSyncRef.current, fresh.updatedAt);
                    }
                    setCountsVersion((v) => v + 1);
                }
            } catch (err) {
                console.error("[useAgendaData] onMoveEvent error", err);
                // Revert the optimistic move to the last server-known position.
                setEvents((prev) => prev.map((e) => (e.id === id ? current : e)));
                setError(t("toasts.save-error", "Impossible de déplacer l'événement"));
            }
        },
        [events, dbAgenda, t],
    );

    // Quick edit from the EventQuickView popup. Merges the patch into the full
    // current event (mapToBackend backfills defaults, so a partial patch would
    // wipe other fields), persists, patches local state, and returns the fresh
    // event so the popup can confirm/close. Returns null on failure.
    const onUpdateEvent = useCallback(
        async (id, patch) => {
            if (Number(id) < 0) return null; // virtual birthday: not editable
            const current = (events || []).find((e) => e.id === id);
            if (!current) {
                console.error("[useAgendaData] onUpdateEvent: event not found", id);
                return null;
            }
            try {
                const fresh = await dbAgenda.update(id, { ...current, ...patch });
                if (fresh?.id) {
                    setEvents((prev) => prev.map((e) => (e.id === id ? fresh : e)));
                    if (fresh.updatedAt) {
                        lastSyncRef.current = Math.max(lastSyncRef.current, fresh.updatedAt);
                    }
                    setCountsVersion((v) => v + 1);
                }
                return fresh;
            } catch (err) {
                console.error("[useAgendaData] onUpdateEvent error", err);
                setError(t("toasts.save-error", "Impossible d'enregistrer l'événement"));
                return null;
            }
        },
        [events, dbAgenda, t],
    );

    // --- Filter controller (consumed by <CalendarFilterBar>) -----------------
    const activePreset = useMemo(() => matchPreset(filters), [filters]);
    const hasActiveFilters = activePreset !== "all" || filters.types.length > 0;

    const applyPreset = useCallback((name) => {
        const make = PRESETS[name] || PRESETS.all;
        setFilters(make());
    }, []);
    const toggleType = useCallback((code) => {
        setFilters((f) => ({
            ...f,
            types: f.types.includes(code)
                ? f.types.filter((c) => c !== code)
                : [...f.types, code],
        }));
    }, []);
    const setStatus = useCallback((s) => {
        setFilters((f) => ({ ...f, status: f.status === s ? "" : s, overdue: false }));
    }, []);
    const toggleHideAuto = useCallback(() => {
        setFilters((f) => ({ ...f, hideAuto: !f.hideAuto }));
    }, []);
    // Generic patch applier for the entity pickers + chip removals.
    const update = useCallback((patch) => {
        setFilters((f) => ({ ...f, ...patch }));
    }, []);
    const clearFilters = useCallback(() => setFilters(emptyFilters()), []);

    // Saved views: snapshot / apply / delete named filter sets.
    const saveView = useCallback((name) => {
        const trimmed = String(name || "").trim();
        if (!trimmed) return;
        setSavedViews((prev) => {
            const snapshot = { ...filters, types: [...filters.types] };
            const next = [
                ...prev.filter((v) => v.name !== trimmed),
                { id: `${Date.now()}`, name: trimmed, filters: snapshot },
            ];
            persistSavedViews(next);
            return next;
        });
    }, [filters]);
    const applyView = useCallback((id) => {
        const v = savedViews.find((x) => x.id === id);
        if (v) {
            setFilters({ ...emptyFilters(), ...v.filters, types: [...(v.filters.types || [])] });
        }
    }, [savedViews]);
    const deleteView = useCallback((id) => {
        setSavedViews((prev) => {
            const next = prev.filter((v) => v.id !== id);
            persistSavedViews(next);
            return next;
        });
    }, []);

    const hasActive = hasActiveFilters
        || filters.socid > 0
        || filters.projectid > 0
        || filters.usergroup > 0
        || filters.resourceid > 0;

    const filterController = useMemo(
        () => ({
            value: filters,
            options: filterOptions,
            counts,
            activePreset,
            hasActive,
            canAssignToMe: currentUserId > 0,
            savedViews,
            applyPreset,
            toggleType,
            setStatus,
            toggleHideAuto,
            update,
            clear: clearFilters,
            saveView,
            applyView,
            deleteView,
        }),
        [
            filters, filterOptions, counts, activePreset, hasActive, currentUserId, savedViews,
            applyPreset, toggleType, setStatus, toggleHideAuto, update, clearFilters,
            saveView, applyView, deleteView,
        ],
    );

    return {
        view,
        availableViews,
        cursor,
        locale,
        range,
        stats,
        events: displayedEvents,
        loading,
        error,
        filters: filterController,
        onPrev,
        onNext,
        onToday,
        onViewChange,
        onCreate,
        onSelectEvent,
        onSelectDay,
        onSelectSlot,
        onCreateEvent,
        onMoveEvent,
        onUpdateEvent,
    };
};
