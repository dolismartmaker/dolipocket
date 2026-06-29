import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FaPlus, FaArrowRight, FaCircleCheck } from "react-icons/fa6";

import { useMenu } from "src/lib/permissions";

import { MiniMonth } from "./MiniMonth";
import { getTypeMeta } from "./eventTypes";
import { tsToDate, startOfDay, fmtTime, isToday, sameDay, addDays } from "./dateUtils";

const localeFor = (lng) => (String(lng || "").startsWith("en") ? "en-US" : "fr-FR");

// Dashboard agenda card: a compact current-month grid (event dots) plus the
// next few upcoming events. Presentational -- events come from useHomeData.
// Gated on the agenda.read permission (renders nothing otherwise).
export const AgendaHomeWidget = ({ events, className = "" }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation("agenda");
    const { has } = useMenu();
    const locale = localeFor(i18n.language);

    const today = useMemo(() => startOfDay(new Date()), []);

    const upcoming = useMemo(() => {
        const now = Date.now() / 1000;
        return (events || [])
            .filter((ev) => {
                const end = Number(ev.datef) || Number(ev.datep) || 0;
                return end >= now;
            })
            .sort((a, b) => (Number(a.datep) || 0) - (Number(b.datep) || 0))
            .slice(0, 4);
    }, [events]);

    if (!has("agenda.read")) return null;

    const dayBadge = (ev) => {
        const d = tsToDate(ev.datep);
        if (!d) return "";
        if (isToday(d)) return t("today", "Aujourd'hui");
        if (sameDay(d, addDays(new Date(), 1))) return t("tomorrow", "Demain");
        return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center gap-2 px-4 py-2.5 border-b border-soft-border">
                <h2 className="text-sm font-semibold text-strong-text flex-1">{t("title", "Agenda")}</h2>
                <button
                    type="button"
                    onClick={() => navigate("/agenda/new")}
                    className="h-7 w-7 grid place-items-center rounded-md text-primary hover:bg-primary/10 transition-colors"
                    aria-label={t("list.create", "Nouvel événement")}
                >
                    <FaPlus className="text-xs" />
                </button>
                <button
                    type="button"
                    onClick={() => navigate("/agenda")}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                >
                    {t("see-all", "Voir tout")}
                    <FaArrowRight className="text-[10px]" />
                </button>
            </header>

            <div className="p-4 grid gap-4 md:grid-cols-2">
                <MiniMonth
                    cursor={today}
                    events={events}
                    locale={locale}
                    onSelectDay={() => navigate("/agenda")}
                />

                <div className="flex flex-col gap-1.5 min-w-0">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-soft-text">
                        {t("upcoming", "À venir")}
                    </h3>
                    {upcoming.length === 0 ? (
                        <p className="text-[13px] text-soft-text py-2">{t("none-upcoming", "Aucun événement à venir")}</p>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {upcoming.map((ev) => {
                                const meta = getTypeMeta(ev.typeCode);
                                const Icon = meta.Icon;
                                const isDone = (ev.percentage ?? 0) >= 100;
                                return (
                                    <li key={ev.id}>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/agenda/${ev.id}`)}
                                            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-medium-bg/60 transition-colors"
                                        >
                                            <span className={`shrink-0 grid place-items-center h-7 w-7 rounded-md border ${meta.chip}`}>
                                                <Icon className="text-[11px]" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className={`block text-[13px] font-medium text-strong-text truncate ${isDone ? "line-through opacity-60" : ""}`}>
                                                    {ev.label || "-"}
                                                </span>
                                                <span className="block text-[11px] text-soft-text tabular-nums">
                                                    {dayBadge(ev)}
                                                    {!ev.fulldayevent && tsToDate(ev.datep) ? ` - ${fmtTime(tsToDate(ev.datep))}` : ""}
                                                </span>
                                            </span>
                                            {isDone && <FaCircleCheck className="shrink-0 text-emerald-500 text-xs" />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
};
