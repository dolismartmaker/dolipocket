import { useMemo, useRef, useEffect } from "react";

import {
    startOfDay,
    endOfDay,
    tsToDate,
    fmtTime,
    fmtColumnHeader,
    isToday,
    isWeekend,
    minutesSinceMidnight,
} from "./dateUtils";
import { getTypeMeta } from "./eventTypes";

const HOUR_H = 48; // px per hour
const DAY_MINUTES = 24 * 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MAX_TIMED_COLS = 6; // side-by-side timed events before "+N"
const MAX_ALLDAY = 3; // all-day chips per day before "+N"

// All-day / multi-day events do not belong in the hourly grid (they would
// render as full-height columns). They go to the all-day lane instead.
const isAllDayLike = (ev) => {
    if (ev.fulldayevent) return true;
    const s = Number(ev.datep) || 0;
    const e = Number(ev.datef) || 0;
    if (!s) return false;
    if (e && e - s >= 23 * 3600) return true;
    const sd = startOfDay(tsToDate(s));
    const ed = e ? startOfDay(tsToDate(e)) : sd;
    return ed.getTime() > sd.getTime();
};

// Lay out the timed events of a single day into lanes (classic day-view
// algorithm). Returns raw lane / clusterLanes; the renderer applies the column
// cap so dense days stay readable.
const layoutDay = (day, dayEvents) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();

    const timed = (dayEvents || [])
        .filter((ev) => !isAllDayLike(ev))
        .map((ev) => {
            const s = tsToDate(ev.datep);
            if (!s) return null;
            const e = tsToDate(ev.datef) || new Date(s.getTime() + 60 * 60 * 1000);
            const startMs = Math.max(s.getTime(), dayStart);
            const endMs = Math.min(Math.max(e.getTime(), startMs + 15 * 60 * 1000), dayEnd);
            return { ev, startMs, endMs };
        })
        .filter(Boolean)
        .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

    const laneEnds = [];
    timed.forEach((b) => {
        let lane = laneEnds.findIndex((end) => end <= b.startMs);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(b.endMs);
        } else {
            laneEnds[lane] = b.endMs;
        }
        b.lane = lane;
    });

    let clusterStart = 0;
    let clusterMaxEnd = -1;
    let clusterLanes = 0;
    const finalize = (from, to, lanes) => {
        for (let i = from; i < to; i++) timed[i].clusterLanes = lanes;
    };
    timed.forEach((b, i) => {
        if (b.startMs >= clusterMaxEnd && i > clusterStart) {
            finalize(clusterStart, i, clusterLanes);
            clusterStart = i;
            clusterMaxEnd = b.endMs;
            clusterLanes = b.lane + 1;
        } else {
            clusterMaxEnd = Math.max(clusterMaxEnd, b.endMs);
            clusterLanes = Math.max(clusterLanes, b.lane + 1);
        }
    });
    finalize(clusterStart, timed.length, clusterLanes);

    return timed.map((b) => {
        const startMin = (b.startMs - dayStart) / 60000;
        const endMin = (b.endMs - dayStart) / 60000;
        return {
            ev: b.ev,
            top: (startMin / DAY_MINUTES) * (HOUR_H * 24),
            height: Math.max(((endMin - startMin) / DAY_MINUTES) * (HOUR_H * 24), 22),
            lane: b.lane,
            clusterLanes: b.clusterLanes || 1,
        };
    });
};

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const indexByDay = (days, events) => {
    const set = {};
    days.forEach((d) => (set[dayKey(d)] = []));
    for (const ev of events || []) {
        const s = tsToDate(ev.datep);
        if (!s) continue;
        const e = tsToDate(ev.datef) || s;
        for (const d of days) {
            if (e >= startOfDay(d) && s <= endOfDay(d)) {
                set[dayKey(d)].push(ev);
            }
        }
    }
    return set;
};

const EventBlock = ({ block, onSelect }) => {
    const { ev, top, height, lane, clusterLanes } = block;
    const meta = getTypeMeta(ev.typeCode);
    const isDone = (ev.percentage ?? 0) >= 100;
    const tight = height < 34;
    const cols = Math.min(clusterLanes, MAX_TIMED_COLS);
    const leftPct = (lane / cols) * 100;
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onSelect(ev.id);
            }}
            title={ev.label}
            style={{ top, height, left: `${leftPct}%`, width: `calc(${100 / cols}% - 3px)` }}
            className={`absolute rounded-md px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden text-left ${meta.block} ${
                isDone ? "opacity-60 line-through" : ""
            }`}
        >
            <div className="font-semibold truncate">
                {!tight && <span className="tabular-nums mr-1">{fmtTime(tsToDate(ev.datep))}</span>}
                {ev.label || "-"}
            </div>
            {!tight && ev.location && <div className="truncate opacity-80">{ev.location}</div>}
        </button>
    );
};

export const TimeGridView = ({ days, events, locale, onSelectEvent, onSelectSlot }) => {
    const scrollRef = useRef(null);
    const byDay = useMemo(() => indexByDay(days, events || []), [days, events]);
    const allDayByDay = useMemo(() => {
        const map = {};
        days.forEach((d) => {
            map[dayKey(d)] = (byDay[dayKey(d)] || []).filter(isAllDayLike);
        });
        return map;
    }, [days, byDay]);

    const hasAllDay = Object.values(allDayByDay).some((arr) => arr.length > 0);

    useEffect(() => {
        if (!scrollRef.current) return;
        const now = new Date();
        const target = days.some(isToday) ? Math.max(0, now.getHours() - 1) : 8;
        scrollRef.current.scrollTop = target * HOUR_H;
    }, [days]);

    const nowMin = minutesSinceMidnight(new Date());
    const nowTop = (nowMin / DAY_MINUTES) * (HOUR_H * 24);

    return (
        <div className="flex flex-col h-full min-h-0 bg-white">
            {/* Column headers */}
            <div className="shrink-0 flex border-b border-soft-border">
                <div className="w-[52px] shrink-0 border-r border-soft-border" />
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
                    {days.map((d) => {
                        const { weekday, day } = fmtColumnHeader(d, locale);
                        const today = isToday(d);
                        return (
                            <div
                                key={dayKey(d)}
                                className={`px-1 py-1.5 text-center border-r border-soft-border/70 last:border-r-0 ${
                                    isWeekend(d) ? "bg-medium-bg/30" : ""
                                }`}
                            >
                                <div className="text-[11px] uppercase tracking-wide text-soft-text">{weekday}</div>
                                <div
                                    className={`mx-auto mt-0.5 grid place-items-center h-7 w-7 rounded-full text-sm font-semibold ${
                                        today ? "bg-primary text-white" : "text-strong-text"
                                    }`}
                                >
                                    {day}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* All-day lane */}
            {hasAllDay && (
                <div className="shrink-0 flex border-b border-soft-border bg-medium-bg/30 max-h-28 overflow-y-auto">
                    <div className="w-[52px] shrink-0 border-r border-soft-border grid place-items-center text-[10px] text-soft-text uppercase">
                        j.
                    </div>
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
                        {days.map((d) => {
                            const all = allDayByDay[dayKey(d)] || [];
                            const shown = all.slice(0, MAX_ALLDAY);
                            const extra = all.length - shown.length;
                            return (
                                <div key={dayKey(d)} className="p-1 border-r border-soft-border/70 last:border-r-0 flex flex-col gap-0.5">
                                    {shown.map((ev, i) => {
                                        const meta = getTypeMeta(ev.typeCode);
                                        const isDone = (ev.percentage ?? 0) >= 100;
                                        return (
                                            <button
                                                key={ev.id + "-" + i}
                                                type="button"
                                                onClick={() => onSelectEvent(ev.id)}
                                                title={ev.label}
                                                className={`truncate rounded px-1.5 py-0.5 text-[11px] border text-left ${meta.chip} ${
                                                    isDone ? "opacity-60 line-through" : ""
                                                }`}
                                            >
                                                {ev.label || "-"}
                                            </button>
                                        );
                                    })}
                                    {extra > 0 && (
                                        <span className="text-[10px] text-soft-text pl-1 font-medium">+{extra}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Scrollable time grid */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
                <div className="flex" style={{ height: HOUR_H * 24 }}>
                    {/* Hour gutter */}
                    <div className="w-[52px] shrink-0 border-r border-soft-border relative">
                        {HOURS.map((h) => (
                            <div key={h} style={{ height: HOUR_H }} className="relative text-right pr-1.5">
                                <span className="absolute -top-2 right-1.5 text-[10px] text-soft-text tabular-nums">
                                    {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
                        {days.map((d) => {
                            const blocks = layoutDay(d, byDay[dayKey(d)] || []);
                            const visible = blocks.filter((b) => b.lane < MAX_TIMED_COLS);
                            const hiddenCount = blocks.length - visible.length;
                            const today = isToday(d);
                            return (
                                <div
                                    key={dayKey(d)}
                                    className={`relative border-r border-soft-border/70 last:border-r-0 ${
                                        isWeekend(d) ? "bg-medium-bg/20" : ""
                                    }`}
                                >
                                    {HOURS.map((h) => (
                                        <button
                                            key={h}
                                            type="button"
                                            onClick={() =>
                                                onSelectSlot(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0))
                                            }
                                            style={{ height: HOUR_H }}
                                            className="block w-full border-b border-soft-border/40 hover:bg-primary/5 transition-colors"
                                        />
                                    ))}

                                    {today && (
                                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                                            <div className="relative">
                                                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-secondary" />
                                                <div className="border-t-2 border-secondary" />
                                            </div>
                                        </div>
                                    )}

                                    {visible.map((b, i) => (
                                        <EventBlock key={b.ev.id + "-" + i} block={b} onSelect={onSelectEvent} />
                                    ))}

                                    {hiddenCount > 0 && (
                                        <div className="absolute top-1 right-1 z-20 text-[10px] font-medium text-white bg-tertiary/80 rounded px-1.5 py-0.5">
                                            +{hiddenCount}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
