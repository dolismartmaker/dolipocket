import { Calendar } from "src/lib/calendar";

// Mobile agenda: compact calendar (month / day / list -- the week time-grid is
// dropped on phones, too cramped). The shell has no fixed height on mobile
// (AppShell <main> is content-driven), so we pin the calendar to the visible
// viewport minus the 3.5rem bottom nav and let it scroll internally.
//
// Presentational only -- state + handlers come from useAgendaData() via props.
export const AgendaPageMobile = (props) => (
    <div className="h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
        <Calendar {...props} compact />
    </div>
);
