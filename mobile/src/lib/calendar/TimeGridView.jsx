import { useMemo, useRef, useEffect, useState } from "react";

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
import { EventQuickView } from "./EventQuickView";
import { EventQuickCreateModal } from "./EventQuickCreateModal";

const HOUR_H = 64; // px per hour (improved density, like Google Calendar)
const DAY_MINUTES = 24 * 60;
const GRID_H = HOUR_H * 24; // full-day column height in px
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MAX_TIMED_COLS = 6; // side-by-side timed events before "+N"
const MAX_ALLDAY = 4; // all-day chips per day before "+N"
const DRAG_SNAP = 15; // minutes granularity for drag-to-create
const DEFAULT_SLOT_MIN = 30; // duration for a plain click (no drag)

// Convert a cursor Y (viewport px) to minutes-since-midnight, snapped to
// DRAG_SNAP, clamped to the day. rectTop is the column's top in viewport px.
const yToMinutes = (clientY, rectTop) => {
    let m = ((clientY - rectTop) / GRID_H) * DAY_MINUTES;
    m = Math.max(0, Math.min(DAY_MINUTES, m));
    return Math.round(m / DRAG_SNAP) * DRAG_SNAP;
};

// "HH:MM" from minutes-since-midnight.
const fmtMinutes = (m) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
    const tight = height < 48;
    const veryTight = height < 32;
    const cols = Math.min(clusterLanes, MAX_TIMED_COLS);
    const leftPct = (lane / cols) * 100;
    return (
        <button
            type="button"
            data-event-block
            onClick={(e) => {
                e.stopPropagation();
                onSelect(ev.id);
            }}
            title={ev.label}
            style={{ top, height, left: `${leftPct}%`, width: `calc(${100 / cols}% - 3px)` }}
            className={`absolute rounded-lg px-2 py-1 text-[12px] leading-snug overflow-hidden text-left border border-current cursor-pointer hover:shadow-md transition-shadow ${
                meta.block
            } ${isDone ? "opacity-50 line-through" : ""}`}
        >
            {!veryTight && <div className="font-bold truncate">{ev.label || "-"}</div>}
            {veryTight && <div className="text-[11px] truncate">{ev.label || "-"}</div>}
            {!tight && ev.location && <div className="text-[11px] truncate opacity-75">{ev.location}</div>}
            {!tight && !ev.fulldayevent && (
                <div className="text-[11px] font-semibold tabular-nums opacity-75">
                    {fmtTime(tsToDate(ev.datep))}
                </div>
            )}
        </button>
    );
};

export const TimeGridView = ({
    days,
    events,
    locale,
    onSelectEvent,
    onSelectSlot,
    onUpdateEvent,
    onCreateEvent,
}) => {
    const scrollRef = useRef(null);
    const [quickViewOpen, setQuickViewOpen] = useState(false);
    const [selectedEventForQuickView, setSelectedEventForQuickView] = useState(null);
    const [quickCreateOpen, setQuickCreateOpen] = useState(false);
    const [quickCreateDate, setQuickCreateDate] = useState(null);
    const [quickCreateEndDate, setQuickCreateEndDate] = useState(null);
    // Live drag-to-create selection: { dayKey, startMin, endMin } or null.
    const [drag, setDrag] = useState(null);
    const dragRef = useRef(null);

    // Open the quick-create modal for a [startMin, endMin] range on a given day.
    const openQuickCreate = (day, startMin, endMin) => {
        const s = startOfDay(day);
        s.setMinutes(startMin);
        const e = startOfDay(day);
        e.setMinutes(endMin);
        setQuickCreateDate(s);
        setQuickCreateEndDate(e);
        setQuickCreateOpen(true);
    };

    // Mouse-down on a day column starts a drag selection. A pure click (no
    // movement) falls back to a DEFAULT_SLOT_MIN slot at the clicked time.
    const handleColumnMouseDown = (e, day) => {
        if (e.button !== 0) return; // left button only
        if (e.target.closest("[data-event-block]")) return; // let events handle their own click
        const rectTop = e.currentTarget.getBoundingClientRect().top;
        const startMin = yToMinutes(e.clientY, rectTop);
        dragRef.current = { day, rectTop, startMin, endMin: startMin, moved: false };
        setDrag({ dayKey: dayKey(day), startMin, endMin: startMin });

        const onMove = (ev) => {
            const cur = dragRef.current;
            if (!cur) return;
            const endMin = yToMinutes(ev.clientY, cur.rectTop);
            if (Math.abs(endMin - cur.startMin) >= DRAG_SNAP) cur.moved = true;
            cur.endMin = endMin;
            setDrag({ dayKey: dayKey(cur.day), startMin: cur.startMin, endMin });
        };
        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            const cur = dragRef.current;
            dragRef.current = null;
            setDrag(null);
            if (!cur) return;
            const lo = Math.min(cur.startMin, cur.endMin);
            const hi = Math.max(cur.startMin, cur.endMin);
            if (cur.moved && hi - lo >= DRAG_SNAP) {
                openQuickCreate(cur.day, lo, hi);
            } else {
                openQuickCreate(cur.day, cur.startMin, Math.min(cur.startMin + DEFAULT_SLOT_MIN, DAY_MINUTES));
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const byDay = useMemo(() => indexByDay(days, events || []), [days, events]);
    const allDayByDay = useMemo(() => {
        const map = {};
        days.forEach((d) => {
            map[dayKey(d)] = (byDay[dayKey(d)] || []).filter(isAllDayLike);
        });
        return map;
    }, [days, byDay]);

    const hasAllDay = Object.values(allDayByDay).some((arr) => arr.length > 0);

    const handleEventClick = (eventId) => {
        const event = (events || []).find((e) => e.id === eventId);
        if (event) {
            setSelectedEventForQuickView(event);
            setQuickViewOpen(true);
        }
    };

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
            <div className="shrink-0 flex border-b-2 border-soft-border bg-white">
                <div className="w-[80px] shrink-0 border-r border-soft-border" />
                <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
                    {days.map((d) => {
                        const { weekday, day } = fmtColumnHeader(d, locale);
                        const today = isToday(d);
                        return (
                            <div
                                key={dayKey(d)}
                                className={`px-2 py-2 text-center border-r border-soft-border/70 last:border-r-0 ${
                                    isWeekend(d) ? "bg-medium-bg/40" : ""
                                }`}
                            >
                                <div className="text-[12px] uppercase tracking-wider font-semibold text-soft-text">{weekday}</div>
                                <div
                                    className={`mx-auto mt-1 grid place-items-center h-8 w-8 rounded-full text-base font-bold ${
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
                <div className="shrink-0 flex border-b border-soft-border bg-medium-bg/20 max-h-32 overflow-y-auto">
                    <div className="w-[80px] shrink-0 border-r border-soft-border grid place-items-center text-[11px] text-soft-text font-semibold uppercase">
                        Jour
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
                                                onClick={() => handleEventClick(ev.id)}
                                                title={ev.label}
                                                className={`truncate rounded px-1.5 py-0.5 text-[11px] border text-left cursor-pointer ${meta.chip} ${
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
                    <div className="w-[80px] shrink-0 border-r border-soft-border/70 relative bg-medium-bg/30">
                        {HOURS.map((h) => (
                            <div key={h} style={{ height: HOUR_H }} className="relative text-right pr-2 flex items-start justify-end pt-1">
                                <span className="text-[13px] font-semibold text-strong-text tabular-nums">
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
                            const dragSel = drag && drag.dayKey === dayKey(d) ? drag : null;
                            return (
                                <div
                                    key={dayKey(d)}
                                    data-testid="day-column"
                                    onMouseDown={(e) => handleColumnMouseDown(e, d)}
                                    className={`relative border-r border-soft-border/70 last:border-r-0 select-none cursor-crosshair ${
                                        isWeekend(d) ? "bg-medium-bg/15" : "bg-white"
                                    }`}
                                >
                                    {HOURS.map((h) => (
                                        <div
                                            key={h}
                                            style={{ height: HOUR_H }}
                                            className="w-full border-b border-soft-border/30"
                                        />
                                    ))}

                                    {dragSel &&
                                        (() => {
                                            const lo = Math.min(dragSel.startMin, dragSel.endMin);
                                            const hi = Math.max(dragSel.startMin, dragSel.endMin);
                                            const top = (lo / DAY_MINUTES) * GRID_H;
                                            const height = Math.max(((hi - lo) / DAY_MINUTES) * GRID_H, 3);
                                            return (
                                                <div
                                                    className="absolute left-0.5 right-0.5 z-30 rounded-lg bg-primary/20 border-2 border-primary pointer-events-none overflow-hidden"
                                                    style={{ top, height }}
                                                >
                                                    <div className="px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums whitespace-nowrap">
                                                        {fmtMinutes(lo)} - {fmtMinutes(hi > lo ? hi : lo + DEFAULT_SLOT_MIN)}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                    {today && (
                                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                                            <div className="relative">
                                                <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-secondary" />
                                                <div className="border-t-2 border-secondary" />
                                            </div>
                                        </div>
                                    )}

                                    {visible.map((b, i) => (
                                        <EventBlock key={b.ev.id + "-" + i} block={b} onSelect={handleEventClick} />
                                    ))}

                                    {hiddenCount > 0 && (
                                        <div className="absolute top-2 right-2 z-20 text-[11px] font-bold text-white bg-tertiary rounded-lg px-2 py-1 cursor-pointer hover:bg-tertiary/90 transition-colors">
                                            +{hiddenCount}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Quick view popup */}
            <EventQuickView
                event={selectedEventForQuickView}
                isOpen={quickViewOpen}
                onClose={() => setQuickViewOpen(false)}
                onUpdate={onUpdateEvent}
                onOpenFull={onSelectEvent}
            />

            {/* Quick create modal (Nextcloud-style). Keyed on the selected slot so
                its internal start/end state re-inits for each new selection. */}
            <EventQuickCreateModal
                key={
                    quickCreateOpen && quickCreateDate
                        ? `${quickCreateDate.getTime()}-${quickCreateEndDate ? quickCreateEndDate.getTime() : 0}`
                        : "closed"
                }
                isOpen={quickCreateOpen}
                defaultDate={quickCreateDate}
                defaultEndDate={quickCreateEndDate}
                onClose={() => setQuickCreateOpen(false)}
                onSubmit={onCreateEvent}
            />
        </div>
    );
};
