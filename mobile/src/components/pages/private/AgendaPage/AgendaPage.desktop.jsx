import { Calendar } from "src/lib/calendar";

// Desktop agenda: full calendar (week view by default via index.jsx).
// Presentational only -- all state + handlers come from useAgendaData() via props.
export const AgendaPageDesktop = (props) => <Calendar {...props} compact={false} />;
