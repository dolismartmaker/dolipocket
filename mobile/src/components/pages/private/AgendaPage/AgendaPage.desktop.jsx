import { Calendar } from "src/lib/calendar";

// Desktop agenda: full calendar (month / week / day / list) filling the
// AppShell <main> height. Presentational only -- all state + handlers come
// from useAgendaData() via props (cf .claude/CLAUDE.md viewport-aware pattern).
export const AgendaPageDesktop = (props) => <Calendar {...props} compact={false} />;
