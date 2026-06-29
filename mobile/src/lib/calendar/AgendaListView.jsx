import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FaCircleCheck, FaLocationDot, FaChevronRight } from "react-icons/fa6";

import { tsToDate, startOfDay, fmtTime, fmtDayTitle, isToday, sameDay, addDays } from "./dateUtils";
import { getTypeMeta } from "./eventTypes";

// Group events into day buckets, sorted chronologically, all-day first.
const groupByDay = (events) => {
    const groups = new Map();
    for (const ev of events || []) {
        const start = tsToDate(ev.datep);
        if (!start) continue;
        const day = startOfDay(start);
        const key = day.getTime();
        if (!groups.has(key)) groups.set(key, { day, items: [] });
        groups.get(key).items.push(ev);
    }
    const arr = Array.from(groups.values()).sort((a, b) => a.day - b.day);
    arr.forEach((g) =>
        g.items.sort((a, b) => {
            const fa = a.fulldayevent ? 0 : 1;
            const fb = b.fulldayevent ? 0 : 1;
            if (fa !== fb) return fa - fb;
            return (Number(a.datep) || 0) - (Number(b.datep) || 0);
        }),
    );
    return arr;
};

export const AgendaListView = ({ events, range, locale, onSelectEvent }) => {
    const { t } = useTranslation("agenda");

    // Clamp to the navigated window: the backend has no lower bound for events
    // without an end date (datep2 NULL), so it can return items predating the
    // range. We keep events whose [start, end] intersects [range.start, range.end].
    const scoped = useMemo(() => {
        if (!range) return events || [];
        return (events || []).filter((ev) => {
            const start = Number(ev.datep) || 0;
            const end = Number(ev.datef) || start;
            return start <= range.end && end >= range.start;
        });
    }, [events, range]);

    const groups = useMemo(() => groupByDay(scoped), [scoped]);

    const dayLabel = (day) => {
        if (isToday(day)) return t("today", "Aujourd'hui");
        if (sameDay(day, addDays(new Date(), 1))) return t("tomorrow", "Demain");
        return fmtDayTitle(day, locale);
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-medium-bg/40">
            <div className="max-w-3xl mx-auto p-3 md:p-4 flex flex-col gap-4">
                {groups.map((g) => (
                    <section key={g.day.getTime()}>
                        <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-medium-bg/40 backdrop-blur">
                            <h3 className={`text-[13px] font-bold ${isToday(g.day) ? "text-primary" : "text-strong-text"}`}>
                                {dayLabel(g.day)}
                            </h3>
                        </div>
                        <ul className="mt-1 flex flex-col gap-1.5">
                            {g.items.map((ev) => {
                                const meta = getTypeMeta(ev.typeCode);
                                const Icon = meta.Icon;
                                const isDone = (ev.percentage ?? 0) >= 100;
                                const start = tsToDate(ev.datep);
                                const end = tsToDate(ev.datef);
                                return (
                                    <li key={ev.id}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectEvent(ev.id)}
                                            className="w-full flex items-center gap-3 bg-white border border-soft-border rounded-lg px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                        >
                                            <span className={`shrink-0 grid place-items-center h-9 w-9 rounded-lg ${meta.chip}`}>
                                                <Icon className="text-sm" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className={`block font-semibold text-[14px] text-strong-text truncate ${isDone ? "line-through opacity-60" : ""}`}>
                                                    {ev.label || "-"}
                                                </span>
                                                <span className="flex items-center gap-2 text-[12px] text-soft-text">
                                                    <span className="tabular-nums">
                                                        {ev.fulldayevent
                                                            ? t("all-day", "Journée")
                                                            : `${fmtTime(start)}${end ? " - " + fmtTime(end) : ""}`}
                                                    </span>
                                                    {ev.location && (
                                                        <span className="flex items-center gap-1 truncate">
                                                            <FaLocationDot className="shrink-0 text-[10px]" />
                                                            <span className="truncate">{ev.location}</span>
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            {isDone ? (
                                                <FaCircleCheck className="shrink-0 text-emerald-500" />
                                            ) : (
                                                <FaChevronRight className="shrink-0 text-soft-text text-xs" />
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
};
