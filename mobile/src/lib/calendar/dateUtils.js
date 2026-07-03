// Pure date helpers for the calendar lib. Zero dependency, zero React.
//
// Conventions:
//   - All calendar events carry unix timestamps in SECONDS (Dolibarr datep/datef).
//   - All Date arithmetic is done in the browser LOCAL timezone (getHours,
//     getDate, ...) so the rendered grid matches the user's wall clock.
//   - The week starts on MONDAY (ISO / French convention).

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

// Convert unix seconds to a JS Date (local). Returns null for falsy input.
export const tsToDate = (unixSeconds) => {
    if (!unixSeconds && unixSeconds !== 0) return null;
    const n = Number(unixSeconds);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000);
};

// Unix seconds (integer) for a given Date.
export const dateToTs = (date) => Math.floor(date.getTime() / 1000);

// Midnight (00:00:00.000) of the day containing `date`, local time.
export const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

// 23:59:59 end of the day containing `date`.
export const endOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const addDays = (date, n) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
};

export const addHours = (date, n) => {
    const d = new Date(date);
    d.setHours(d.getHours() + n);
    return d;
};

export const addMonths = (date, n) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
};

export const startOfMonth = (date) =>
    new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

export const endOfMonth = (date) =>
    new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

// Monday 00:00 of the ISO week containing `date`.
export const startOfWeek = (date) => {
    const d = startOfDay(date);
    const dow = d.getDay(); // 0=Sun .. 6=Sat
    const mondayOffset = (dow + 6) % 7; // Mon->0, Sun->6
    return addDays(d, -mondayOffset);
};

export const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

export const isToday = (date) => sameDay(date, new Date());

export const isWeekend = (date) => {
    const dow = date.getDay();
    return dow === 0 || dow === 6;
};

export const isSameMonth = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

// The 6x7 = 42 days grid covering the month containing `date`, starting on the
// Monday of the week containing the 1st. Always 42 cells for a stable layout.
export const monthMatrix = (date) => {
    const first = startOfMonth(date);
    const gridStart = startOfWeek(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
        cells.push(addDays(gridStart, i));
    }
    return cells;
};

// The 7 days (Mon..Sun) of the week containing `date`.
export const weekDays = (date) => {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

// Fetch range (unix seconds) covering the visible period for a given view.
// We pad month/week so partial weeks at the edges are populated.
export const rangeForView = (view, cursor) => {
    let start;
    let end;
    if (view === "day") {
        start = startOfDay(cursor);
        end = endOfDay(cursor);
    } else if (view === "week") {
        const days = weekDays(cursor);
        start = days[0];
        end = endOfDay(days[6]);
    } else if (view === "list") {
        // Rolling window: from start of cursor month to +2 months ahead.
        start = startOfMonth(cursor);
        end = endOfDay(addDays(endOfMonth(addMonths(cursor, 1)), 0));
    } else {
        // month: the full visible 6-week grid.
        const cells = monthMatrix(cursor);
        start = cells[0];
        end = endOfDay(cells[41]);
    }
    return { start: dateToTs(start), end: dateToTs(end) };
};

// --- Formatters (Intl-based for i18n) ------------------------------------

const intlCache = {};
const fmtr = (locale, opts) => {
    const key = locale + JSON.stringify(opts);
    if (!intlCache[key]) intlCache[key] = new Intl.DateTimeFormat(locale, opts);
    return intlCache[key];
};

// "08:30"
export const fmtTime = (date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

// "Juin 2026" / "June 2026"
export const fmtMonthTitle = (date, locale = "fr-FR") => {
    const s = fmtr(locale, { month: "long", year: "numeric" }).format(date);
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// "Lundi 15 juin" / "Monday, June 15"
export const fmtDayTitle = (date, locale = "fr-FR") => {
    const s = fmtr(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);
    return s.charAt(0).toUpperCase() + s.slice(1);
};

// "15 - 21 juin 2026" style range title for the week view.
export const fmtWeekTitle = (date, locale = "fr-FR") => {
    const days = weekDays(date);
    const a = days[0];
    const b = days[6];
    if (a.getMonth() === b.getMonth()) {
        const month = fmtr(locale, { month: "long", year: "numeric" }).format(a);
        return `${a.getDate()} - ${b.getDate()} ${month}`;
    }
    const left = fmtr(locale, { day: "numeric", month: "short" }).format(a);
    const right = fmtr(locale, { day: "numeric", month: "short", year: "numeric" }).format(b);
    return `${left} - ${right}`;
};

// Short weekday labels Mon..Sun for the given locale, e.g. ["lun","mar",...].
export const weekdayLabels = (locale = "fr-FR") => {
    // 2024-01-01 was a Monday.
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
        const s = fmtr(locale, { weekday: "short" }).format(addDays(monday, i));
        return s.replace(".", "");
    });
};

// "lun. 15" compact day header for the time grid columns.
export const fmtColumnHeader = (date, locale = "fr-FR") => {
    const wd = fmtr(locale, { weekday: "short" }).format(date).replace(".", "");
    return { weekday: wd, day: date.getDate() };
};

// Minutes since local midnight for a Date.
export const minutesSinceMidnight = (date) => date.getHours() * 60 + date.getMinutes();

// "YYYY-MM-DDTHH:mm" in LOCAL time, for <input type="datetime-local"> values.
// NB: never use date.toISOString().slice(0,16) here -- that yields UTC and
// shifts the displayed clock by the timezone offset.
export const toLocalInputValue = (date) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};
