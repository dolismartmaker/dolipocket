import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { FaRegCalendarXmark, FaPlus } from "react-icons/fa6";

import { CalendarToolbar } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { TimeGridView } from "./TimeGridView";
import { AgendaListView } from "./AgendaListView";
import { fmtMonthTitle, fmtWeekTitle, fmtDayTitle, weekDays } from "./dateUtils";

const DEFAULT_VIEWS = ["month", "week", "day", "list"];

// Self-contained calendar shell. The parent (useAgendaData) owns all state and
// handlers; Calendar only composes the toolbar with the active view and adds
// the period title, view transition and loading / empty affordances.
export const Calendar = ({
    view,
    availableViews = DEFAULT_VIEWS,
    cursor,
    locale = "fr-FR",
    range,
    stats,
    events,
    loading,
    error,
    onPrev,
    onNext,
    onToday,
    onViewChange,
    onCreate,
    onSelectEvent,
    onSelectDay,
    onSelectSlot,
    compact = false,
}) => {
    const { t } = useTranslation("agenda");

    const title = useMemo(() => {
        if (view === "week") return fmtWeekTitle(cursor, locale);
        if (view === "day") return fmtDayTitle(cursor, locale);
        return fmtMonthTitle(cursor, locale); // month + list
    }, [view, cursor, locale]);

    const days = useMemo(() => {
        if (view === "week") return weekDays(cursor);
        if (view === "day") return [cursor];
        return null;
    }, [view, cursor]);

    const isEmpty = !loading && (events?.length ?? 0) === 0;

    const renderView = () => {
        if (view === "list") {
            if (isEmpty) return null;
            return <AgendaListView events={events} range={range} locale={locale} onSelectEvent={onSelectEvent} />;
        }
        if (view === "week" || view === "day") {
            return (
                <TimeGridView
                    days={days}
                    events={events}
                    locale={locale}
                    onSelectEvent={onSelectEvent}
                    onSelectSlot={onSelectSlot}
                />
            );
        }
        return (
            <MonthView
                cursor={cursor}
                events={events}
                locale={locale}
                onSelectEvent={onSelectEvent}
                onSelectDay={onSelectDay}
                compact={compact}
            />
        );
    };

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <CalendarToolbar
                view={view}
                availableViews={availableViews}
                title={title}
                stats={stats}
                onPrev={onPrev}
                onNext={onNext}
                onToday={onToday}
                onViewChange={onViewChange}
                onCreate={onCreate}
                compact={compact}
            />

            {error && (
                <div className="shrink-0 mx-3 mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="relative flex-1 min-h-0">
                {/* Thin top loading bar (background revalidation) */}
                {loading && (
                    <div className="absolute top-0 left-0 right-0 z-30 h-0.5 overflow-hidden bg-primary/20">
                        <div className="h-full w-full bg-primary animate-pulse" />
                    </div>
                )}

                {view === "list" && isEmpty ? (
                    <div className="h-full grid place-items-center text-center px-6">
                        <div>
                            <FaRegCalendarXmark className="mx-auto text-4xl text-soft-text/50 mb-3" />
                            <p className="text-soft-text text-sm">{t("list.empty", "Aucun événement trouvé")}</p>
                            <button
                                type="button"
                                onClick={onCreate}
                                className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:brightness-110 transition-[filter]"
                            >
                                <FaPlus className="text-[11px]" />
                                {t("list.create", "Nouvel événement")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${view}-${cursor.getTime()}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="h-full min-h-0"
                        >
                            {renderView()}
                        </motion.div>
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
};
