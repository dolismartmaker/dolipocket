import { useMemo } from "react";

import {
    monthMatrix,
    weekdayLabels,
    startOfDay,
    tsToDate,
    fmtTime,
    isToday,
    isWeekend,
    isSameMonth,
} from "./dateUtils";
import { getTypeMeta } from "./eventTypes";

const DAY_MS = 86400000;
const DAY_NUM_H = 22; // px reserved at top of each cell for the day number
const BAR_H = 18; // px per event bar
const BAR_GAP = 2; // px between bars
const MAX_LANES = 4; // visible bars per week row before "+N"

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayIndex = (date, weekStart) =>
    Math.round((startOfDay(date).getTime() - weekStart.getTime()) / DAY_MS);

// One week row. Events are laid out as continuous bars spanning the columns
// they cover (Google-Calendar style), packed into lanes. Single-day events are
// 1-column bars. This is what stops multi-day events from being repeated in
// every cell.
const WeekRow = ({ weekDays, cursor, events, onSelectEvent, onSelectDay }) => {
    const weekStart = startOfDay(weekDays[0]);
    const weekEndDay = startOfDay(weekDays[6]);

    const { segs, hidden } = useMemo(() => {
        const list = [];
        for (const ev of events) {
            const s = tsToDate(ev.datep);
            if (!s) continue;
            const e = tsToDate(ev.datef) || s;
            const sd = startOfDay(s);
            const ed = startOfDay(e);
            if (ed < weekStart || sd > weekEndDay) continue;
            list.push({
                ev,
                colStart: Math.max(0, dayIndex(s, weekStart)),
                colEnd: Math.min(6, dayIndex(e, weekStart)),
                contLeft: sd < weekStart,
                contRight: ed > weekEndDay,
            });
        }
        // Longest / earliest first for a stable, compact packing.
        list.sort(
            (a, b) =>
                a.colStart - b.colStart ||
                b.colEnd - b.colStart - (a.colEnd - a.colStart) ||
                (Number(a.ev.datep) || 0) - (Number(b.ev.datep) || 0),
        );
        const laneIntervals = [];
        for (const seg of list) {
            let lane = 0;
            for (;;) {
                const occupied = (laneIntervals[lane] || []).some(
                    (iv) => !(seg.colEnd < iv[0] || seg.colStart > iv[1]),
                );
                if (!occupied) {
                    (laneIntervals[lane] ||= []).push([seg.colStart, seg.colEnd]);
                    seg.lane = lane;
                    break;
                }
                lane++;
            }
        }
        const hiddenByDay = [0, 0, 0, 0, 0, 0, 0];
        for (const seg of list) {
            if (seg.lane >= MAX_LANES) {
                for (let c = seg.colStart; c <= seg.colEnd; c++) hiddenByDay[c]++;
            }
        }
        return { segs: list, hidden: hiddenByDay };
    }, [events, weekStart, weekEndDay]);

    return (
        <div className="relative flex-1 min-h-0 overflow-hidden">
            {/* Day cell backgrounds + day numbers + overflow counters */}
            <div className="grid grid-cols-7 h-full">
                {weekDays.map((day, i) => {
                    const out = !isSameMonth(day, cursor);
                    const today = isToday(day);
                    const weekend = isWeekend(day);
                    return (
                        <button
                            type="button"
                            key={dayKey(day)}
                            onClick={() => onSelectDay(day)}
                            className={`relative text-left border-r border-b border-soft-border/70 last:border-r-0 ${
                                out ? "bg-medium-bg/40" : weekend ? "bg-medium-bg/20" : "bg-white"
                            } hover:bg-primary/5 transition-colors`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 grid place-items-center text-[12px] font-medium h-6 min-w-6 px-1 rounded-full ${
                                    today ? "bg-primary text-white" : out ? "text-soft-text" : "text-strong-text"
                                }`}
                            >
                                {day.getDate()}
                            </span>
                            {hidden[i] > 0 && (
                                <span className="absolute bottom-0.5 left-1 text-[10px] text-soft-text font-medium">
                                    +{hidden[i]}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Event bars overlay */}
            <div className="absolute inset-0 pointer-events-none">
                {segs
                    .filter((s) => s.lane < MAX_LANES)
                    .map((seg, idx) => {
                        const meta = getTypeMeta(seg.ev.typeCode);
                        const isDone = (seg.ev.percentage ?? 0) >= 100;
                        const isMulti = seg.colEnd > seg.colStart || seg.contLeft || seg.contRight;
                        const showTime = !seg.ev.fulldayevent && !isMulti;
                        const left = `calc(${(seg.colStart / 7) * 100}% + 2px)`;
                        const width = `calc(${((seg.colEnd - seg.colStart + 1) / 7) * 100}% - 4px)`;
                        const top = DAY_NUM_H + seg.lane * (BAR_H + BAR_GAP);
                        return (
                            <button
                                type="button"
                                key={seg.ev.id + "-" + idx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectEvent(seg.ev.id);
                                }}
                                title={seg.ev.label}
                                style={{ left, width, top, height: BAR_H }}
                                className={`pointer-events-auto absolute truncate rounded px-1.5 text-[11px] leading-[18px] border ${meta.chip} ${
                                    isDone ? "opacity-60 line-through" : ""
                                } ${seg.contLeft ? "rounded-l-none" : ""} ${seg.contRight ? "rounded-r-none" : ""}`}
                            >
                                {showTime && (
                                    <span className="font-semibold tabular-nums mr-1">
                                        {fmtTime(tsToDate(seg.ev.datep))}
                                    </span>
                                )}
                                {seg.ev.label || "-"}
                            </button>
                        );
                    })}
            </div>
        </div>
    );
};

// Compact (mobile) dots, attached to the event START day only to keep the tiny
// cells readable (a spanning event no longer dots every day).
const startDayIndex = (events) => {
    const map = {};
    for (const ev of events || []) {
        const s = tsToDate(ev.datep);
        if (!s) continue;
        (map[dayKey(startOfDay(s))] ||= []).push(ev);
    }
    return map;
};

export const MonthView = ({ cursor, events, locale, onSelectEvent, onSelectDay, compact = false }) => {
    const cells = useMemo(() => monthMatrix(cursor), [cursor]);
    const labels = useMemo(() => weekdayLabels(locale), [locale]);
    const weeks = useMemo(
        () => [0, 1, 2, 3, 4, 5].map((w) => cells.slice(w * 7, w * 7 + 7)),
        [cells],
    );
    const byStartDay = useMemo(() => (compact ? startDayIndex(events) : {}), [events, compact]);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-soft-border bg-medium-bg/60">
                {labels.map((l, i) => (
                    <div
                        key={l + i}
                        className={`px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-center ${
                            i >= 5 ? "text-soft-text" : "text-medium-text"
                        }`}
                    >
                        {l}
                    </div>
                ))}
            </div>

            {compact ? (
                <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
                    {cells.map((day) => {
                        const evs = byStartDay[dayKey(startOfDay(day))] || [];
                        const out = !isSameMonth(day, cursor);
                        const today = isToday(day);
                        const weekend = isWeekend(day);
                        return (
                            <button
                                type="button"
                                key={dayKey(day)}
                                onClick={() => onSelectDay(day)}
                                className={`relative border-r border-b border-soft-border/70 last:border-r-0 p-1 flex flex-col items-center gap-1 ${
                                    out ? "bg-medium-bg/40" : weekend ? "bg-medium-bg/20" : "bg-white"
                                } hover:bg-primary/5 transition-colors`}
                            >
                                <span
                                    className={`grid place-items-center text-[12px] font-medium h-6 min-w-6 px-1 rounded-full ${
                                        today ? "bg-primary text-white" : out ? "text-soft-text" : "text-strong-text"
                                    }`}
                                >
                                    {day.getDate()}
                                </span>
                                {evs.length > 0 && (
                                    <span className="flex items-center gap-0.5 flex-wrap justify-center">
                                        {evs.slice(0, 4).map((ev, i) => (
                                            <span
                                                key={ev.id + "-" + i}
                                                className={`inline-block h-1.5 w-1.5 rounded-full ${getTypeMeta(ev.typeCode).dot} ${
                                                    (ev.percentage ?? 0) >= 100 ? "opacity-50" : ""
                                                }`}
                                            />
                                        ))}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0">
                    {weeks.map((wd, i) => (
                        <WeekRow
                            key={i}
                            weekDays={wd}
                            cursor={cursor}
                            events={events || []}
                            onSelectEvent={onSelectEvent}
                            onSelectDay={onSelectDay}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
