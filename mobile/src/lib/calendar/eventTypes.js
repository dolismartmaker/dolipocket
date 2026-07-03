// Visual metadata for Dolibarr ActionComm event types (type_code).
//
// Maps each known type_code (or a sensible prefix fallback) to a colour family
// and an icon. Colours are written as FULL static Tailwind class strings so the
// JIT compiler can see them (never build class names by concatenation).
//
// labelKey is relative to the "agenda" i18n namespace ("types.meeting", ...),
// so a consumer translates with t(meta.labelKey).

import {
    FaUserGroup,
    FaPhone,
    FaEnvelope,
    FaListCheck,
    FaRegCalendar,
    FaCakeCandles,
} from "react-icons/fa6";

// Each colour family ships the class strings used across the three renderers:
//   - dot   : small solid bullet (month cell, legend)
//   - chip  : pill background in the month grid
//   - block : positioned block in the time grid (left accent border included)
const FAMILIES = {
    meeting: {
        key: "meeting",
        labelKey: "types.meeting",
        Icon: FaUserGroup,
        dot: "bg-indigo-500",
        chip: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100",
        block: "bg-indigo-100/90 border-l-4 border-indigo-500 text-indigo-900",
    },
    phone: {
        key: "phone",
        labelKey: "types.phone",
        Icon: FaPhone,
        dot: "bg-emerald-500",
        chip: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
        block: "bg-emerald-100/90 border-l-4 border-emerald-500 text-emerald-900",
    },
    email: {
        key: "email",
        labelKey: "types.email",
        Icon: FaEnvelope,
        dot: "bg-amber-500",
        chip: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
        block: "bg-amber-100/90 border-l-4 border-amber-500 text-amber-900",
    },
    task: {
        key: "task",
        labelKey: "types.task",
        Icon: FaListCheck,
        dot: "bg-violet-500",
        chip: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",
        block: "bg-violet-100/90 border-l-4 border-violet-500 text-violet-900",
    },
    other: {
        key: "other",
        labelKey: "types.other",
        Icon: FaRegCalendar,
        dot: "bg-slate-400",
        chip: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200",
        block: "bg-slate-100/90 border-l-4 border-slate-400 text-slate-800",
    },
    birthday: {
        key: "birthday",
        labelKey: "types.birthday",
        Icon: FaCakeCandles,
        dot: "bg-pink-500",
        chip: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100",
        block: "bg-pink-100/90 border-l-4 border-pink-500 text-pink-900",
    },
};

// Explicit type_code -> family. Unknown codes fall back via prefix heuristics.
const CODE_MAP = {
    AC_RDV: "meeting",
    AC_TEL: "phone",
    AC_EMAIL: "email",
    AC_FAX: "other",
    AC_OTH: "other",
    AC_OTH_AUTO: "other",
    BIRTHDAY: "birthday",
};

// Resolve a type_code to its visual family meta.
export const getTypeMeta = (typeCode) => {
    const code = String(typeCode || "").toUpperCase();
    if (CODE_MAP[code]) return FAMILIES[CODE_MAP[code]];
    if (code.includes("RDV") || code.includes("MEET")) return FAMILIES.meeting;
    if (code.includes("TEL") || code.includes("PHONE") || code.includes("CALL")) return FAMILIES.phone;
    if (code.includes("MAIL")) return FAMILIES.email;
    if (code.includes("TASK") || code.includes("TODO")) return FAMILIES.task;
    if (code.includes("BIRTH")) return FAMILIES.birthday;
    return FAMILIES.other;
};

// Ordered list for the colour legend.
export const TYPE_LEGEND = [
    FAMILIES.meeting,
    FAMILIES.phone,
    FAMILIES.email,
    FAMILIES.task,
    FAMILIES.other,
];
