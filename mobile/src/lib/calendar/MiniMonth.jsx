import { useMemo } from "react";

import { monthMatrix, weekdayLabels, startOfDay, tsToDate, isToday, isSameMonth } from "./dateUtils";
import { getTypeMeta } from "./eventTypes";

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Dot index keyed on the event START day only (a spanning event no longer dots
// every day of its range -- keeps the mini grid glanceable).
const indexByDay = (events) => {
    const map = {};
    for (const ev of events || []) {
        const start = tsToDate(ev.datep);
        if (!start) continue;
        (map[dayKey(startOfDay(start))] ||= []).push(ev);
    }
    return map;
};

// Compact month grid for the dashboard. Days with events show up to 3 colour
// dots; today is highlighted. Click a day -> onSelectDay(date).
export const MiniMonth = ({ cursor, events, locale = "fr-FR", onSelectDay }) => {
    const cells = useMemo(() => monthMatrix(cursor), [cursor]);
    const labels = useMemo(() => weekdayLabels(locale).map((l) => l.charAt(0).toUpperCase()), [locale]);
    const byDay = useMemo(() => indexByDay(events || []), [events]);

    return (
        <div>
            <div className="grid grid-cols-7 mb-1">
                {labels.map((l, i) => (
                    <div key={i} className="text-center text-[10px] font-semibold text-soft-text">
                        {l}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day) => {
                    const evs = byDay[dayKey(day)] || [];
                    const out = !isSameMonth(day, cursor);
                    const today = isToday(day);
                    return (
                        <button
                            type="button"
                            key={dayKey(day)}
                            onClick={() => onSelectDay?.(day)}
                            className="relative aspect-square flex flex-col items-center justify-center rounded-md hover:bg-primary/5 transition-colors"
                        >
                            <span
                                className={`grid place-items-center h-6 w-6 text-[11px] rounded-full ${
                                    today
                                        ? "bg-primary text-white font-semibold"
                                        : out
                                            ? "text-soft-text/60"
                                            : "text-strong-text"
                                }`}
                            >
                                {day.getDate()}
                            </span>
                            {evs.length > 0 && (
                                <span className="absolute bottom-0.5 flex items-center gap-0.5">
                                    {evs.slice(0, 3).map((ev, i) => (
                                        <span
                                            key={ev.id + "-" + i}
                                            className={`inline-block h-1 w-1 rounded-full ${getTypeMeta(ev.typeCode).dot} ${
                                                (ev.percentage ?? 0) >= 100 ? "opacity-40" : ""
                                            }`}
                                        />
                                    ))}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
