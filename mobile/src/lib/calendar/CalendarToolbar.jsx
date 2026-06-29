import { useTranslation } from "react-i18next";
import { FaAngleLeft, FaAngleRight, FaPlus } from "react-icons/fa6";

import { TYPE_LEGEND } from "./eventTypes";

// Calendar header: period navigation, current-period title, view switcher,
// colour legend and the "new event" action. Presentational only; every
// interaction is delegated to props.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md): borders, not shadows,
// density tight, no transition-all, no rounded-2xl.
export const CalendarToolbar = ({
    view,
    availableViews,
    title,
    stats,
    onPrev,
    onNext,
    onToday,
    onViewChange,
    onCreate,
    compact = false,
}) => {
    const { t } = useTranslation("agenda");

    return (
        <header className="shrink-0 border-b border-soft-border bg-white">
            {/* Row 1: navigation + title + new */}
            <div className="flex items-center gap-2 px-3 py-2 md:px-4">
                <button
                    type="button"
                    onClick={onToday}
                    className="h-8 px-3 rounded-md border border-soft-border text-[13px] font-medium text-strong-text hover:bg-medium-bg transition-colors"
                >
                    {t("today", "Aujourd'hui")}
                </button>
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={onPrev}
                        aria-label={t("prev", "Précédent")}
                        className="h-8 w-8 grid place-items-center rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    >
                        <FaAngleLeft />
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        aria-label={t("next", "Suivant")}
                        className="h-8 w-8 grid place-items-center rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    >
                        <FaAngleRight />
                    </button>
                </div>

                <h2 className="flex-1 min-w-0 truncate text-[15px] md:text-base font-bold text-strong-text px-1">
                    {title}
                </h2>

                <button
                    type="button"
                    onClick={onCreate}
                    className="h-8 px-3 rounded-md bg-primary text-white text-[13px] font-medium flex items-center gap-1.5 hover:brightness-110 transition-[filter]"
                >
                    <FaPlus className="text-[11px]" />
                    <span className={compact ? "hidden sm:inline" : ""}>{t("list.create", "Nouvel événement")}</span>
                </button>
            </div>

            {/* Row 2: view switcher + legend */}
            <div className="flex items-center gap-3 px-3 pb-2 md:px-4 overflow-x-auto">
                <div className="inline-flex rounded-md border border-soft-border overflow-hidden shrink-0">
                    {availableViews.map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => onViewChange(v)}
                            className={`h-7 px-3 text-[12px] font-medium border-r border-soft-border last:border-r-0 transition-colors ${
                                view === v
                                    ? "bg-primary text-white"
                                    : "bg-white text-soft-text hover:bg-medium-bg hover:text-strong-text"
                            }`}
                        >
                            {t(`view-modes.${v}`)}
                        </button>
                    ))}
                </div>

                {stats && (
                    <div className="flex items-center gap-2 shrink-0 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-medium-bg text-medium-text font-medium tabular-nums">
                            {t("stats.events", { count: stats.total })}
                        </span>
                        {stats.todo > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-medium tabular-nums">
                                {t("stats.todo", { count: stats.todo })}
                            </span>
                        )}
                    </div>
                )}

                {!compact && (
                    <ul className="flex items-center gap-3 shrink-0 ml-auto">
                        {TYPE_LEGEND.map((meta) => (
                            <li key={meta.key} className="flex items-center gap-1.5 text-[11px] text-soft-text">
                                <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                                {t(meta.labelKey)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </header>
    );
};
