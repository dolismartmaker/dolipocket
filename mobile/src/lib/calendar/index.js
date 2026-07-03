// Calendar lib (PWA-GUIDELINES compliant, zero external calendar dependency).
//
// A self-contained, viewport-aware calendar built on React + Tailwind +
// framer-motion. Month / Week / Day / List views, colour-coded by Dolibarr
// ActionComm type_code, click-to-create slots and current-time indicator.
//
// To be promoted into @cap-rel/smartcommon once battle-tested (Phase 3).
export { Calendar } from "./Calendar";
export { MonthView } from "./MonthView";
export { TimeGridView } from "./TimeGridView";
export { AgendaListView } from "./AgendaListView";
export { CalendarToolbar } from "./CalendarToolbar";
export { CalendarFilterBar } from "./CalendarFilterBar";
export { MiniMonth } from "./MiniMonth";
export { AgendaHomeWidget } from "./AgendaHomeWidget";
export { getTypeMeta, TYPE_LEGEND } from "./eventTypes";
export * from "./dateUtils";
