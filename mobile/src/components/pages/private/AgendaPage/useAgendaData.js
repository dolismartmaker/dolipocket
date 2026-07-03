import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";
import { rangeForView, startOfDay, addDays, addMonths, dateToTs } from "src/lib/calendar";

const localeFor = (lng) => (String(lng || "").startsWith("en") ? "en-US" : "fr-FR");

// Data + interaction hook shared by the mobile and desktop agenda calendars.
// Owns: current view, navigation cursor, the events of the visible range, and
// every handler the <Calendar> needs. Presentational views stay pure.
//
// availableViews / defaultView are provided by the viewport-specific page so
// the mobile shell can drop the cramped week time-grid.
export const useAgendaData = ({ availableViews, defaultView = "month" } = {}) => {
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const { t, i18n } = useTranslation("agenda");
    const locale = localeFor(i18n.language);

    const [view, setView] = useState(defaultView);
    const [cursor, setCursor] = useState(() => startOfDay(new Date()));
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [revalidateKey, setRevalidateKey] = useState(0);

    const hasClient = !!dbAgenda.list;
    const cursorTime = cursor.getTime();

    // Visible range (unix seconds) for the current view/cursor. The List view
    // uses it to clamp out the backend's "no end date" events that predate the
    // window (datep2 NULL has no lower bound server-side).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const range = useMemo(() => rangeForView(view, cursor), [view, cursorTime]);

    // Lightweight counters for the toolbar (over the fetched range).
    const stats = useMemo(() => {
        const list = events || [];
        const todo = list.filter((ev) => (ev.percentage ?? 0) < 100).length;
        return { total: list.length, todo, done: list.length - todo };
    }, [events]);

    useEffect(() => {
        if (!hasClient) return undefined;
        let cancelled = false;
        const { start, end } = range;
        setLoading(true);
        setError(null);
        dbAgenda
            .list({ start, end })
            .then((rows) => {
                if (!cancelled) setEvents(Array.isArray(rows) ? rows : []);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, range, revalidateKey]);

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

    const onSelectEvent = useCallback((id) => navigate(`/agenda/${id}`), [navigate]);

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

    // Quick create via modal: create event and return {id}.
    // Trigger list revalidation after creation so the new event appears.
    const onCreateEvent = useCallback(
        async (payload) => {
            try {
                const result = await dbAgenda.create(payload);
                if (result?.id) {
                    setRevalidateKey((prev) => prev + 1);
                }
                return result;
            } catch (err) {
                console.error("[useAgendaData] onCreateEvent error", err);
                throw err;
            }
        },
        [dbAgenda],
    );

    return {
        view,
        availableViews,
        cursor,
        locale,
        range,
        stats,
        events,
        loading,
        error,
        onPrev,
        onNext,
        onToday,
        onViewChange,
        onCreate,
        onSelectEvent,
        onSelectDay,
        onSelectSlot,
        onCreateEvent,
    };
};
