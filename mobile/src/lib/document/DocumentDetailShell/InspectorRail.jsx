import { useState } from "react";
import { FaAnglesRight } from "react-icons/fa6";

// Shared row used by the pinned Totaux card (and reusable by config tab panels
// such as Paiements). Exported so feature descriptors render consistent rows.
export const TotalRow = ({ label, value, strong = false, accent = "" }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-[13px] ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={`${strong ? "font-semibold" : ""} ${accent || "text-strong-text"}`}>{value}</span>
    </div>
);

// Right-hand inspector: a pinned Totaux card on top, then an icon tab strip
// switching the secondary sections (Informations / Documents / Contacts /
// Objets liés / ...). The document lines stay the full-width star on the left;
// this rail sticks while the lines scroll.
//
// config.sideRail.totalsRows(object) -> [{ label, value, strong, accent }]
// config.tabs -> [{ id, label, icon, badge?(object), render({ object, data }) }]
export const InspectorRail = ({ config, object, data, onCollapse }) => {
    const tabs = (config.tabs || []).filter((t) => (t.available ? t.available(object, data) : true));
    const [activeId, setActiveId] = useState(tabs[0]?.id ?? null);

    const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;
    const totalsRows = config.sideRail?.totalsRows ? config.sideRail.totalsRows(object) : null;

    return (
        <aside className="w-[360px] shrink-0 flex flex-col gap-4 sticky top-0 self-start max-h-[calc(100dvh-176px)] overflow-y-auto pb-2">
            {/* Pinned Totaux + collapse toggle */}
            {totalsRows && (
                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                    <header className="px-4 py-2.5 border-b border-soft-border flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="p-1 -mr-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                            aria-label="Replier le panneau"
                            title="Replier le panneau"
                        >
                            <FaAnglesRight className="text-[12px]" />
                        </button>
                    </header>
                    <div className="px-4 py-2">
                        {totalsRows.map((r, i) => (
                            <TotalRow key={i} label={r.label} value={r.value} strong={r.strong} accent={r.accent} />
                        ))}
                    </div>
                </section>
            )}

            {/* Icon tab strip */}
            {tabs.length > 0 && (
                <div className="bg-white rounded-xl border border-soft-border px-2 py-1.5 flex items-center gap-1 flex-wrap">
                    {tabs.map((t) => {
                        const Icon = t.icon;
                        const isActive = active && t.id === active.id;
                        const badge = t.badge ? t.badge(object) : null;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveId(t.id)}
                                title={t.label}
                                aria-label={t.label}
                                className={`relative h-8 w-9 flex items-center justify-center rounded-md text-[14px] transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-soft-text hover:bg-medium-bg hover:text-strong-text"}`}
                            >
                                {Icon && <Icon />}
                                {badge ? (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                                        {badge}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Active panel: the section component renders its own card. */}
            {active && active.render({ object, data })}
        </aside>
    );
};
