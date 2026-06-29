import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaEllipsisVertical } from "react-icons/fa6";

import { StatusPill } from "src/lib/components/StatusPill";

import { ActionButton } from "./ActionButton";

// Sticky top command bar shared by every document detail page.
//
// It turns the feature's declarative `config.actions` list into a clear
// hierarchy instead of the historical wall of ~13 identical buttons:
//   - exactly ONE contextual primary CTA  (group "primary", first visible)
//   - a few common secondary buttons       (group "common")
//   - everything else folded into a "..." overflow menu, grouped by category
//     (Statut / Conversion / Zone danger), danger items in red.
//
// An action descriptor:
//   { id, label, icon, tone, group, visible(object, data), run(data) }
//   - visible : optional predicate; defaults to always visible.
//   - run     : returns the click handler (e.g. (d) => d.handleValidate).

// Overflow groups, in render order. `danger` has no header (just a separator)
// and forces red styling regardless of the action tone.
const OVERFLOW_GROUPS = [
    { key: "status",  label: "Statut" },
    { key: "convert", label: "Documents / conversion" },
    { key: "danger",  label: null },
];

const OverflowMenu = ({ groups, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const nonEmpty = groups.filter((g) => g.items.length > 0);
    if (nonEmpty.length === 0) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={disabled}
                aria-label="Plus d'actions"
                title="Plus d'actions"
                className={`h-[28px] w-[28px] flex items-center justify-center rounded text-[13px] border transition-colors disabled:opacity-50 ${open ? "bg-medium-bg border-soft-border text-strong-text" : "bg-white border-soft-border text-soft-text hover:bg-medium-bg hover:text-strong-text"}`}
            >
                <FaEllipsisVertical />
            </button>

            {open && (
                <div className="absolute right-0 top-[34px] z-30 w-60 rounded-lg border border-soft-border bg-white py-1 shadow-lg">
                    {nonEmpty.map((g, gi) => (
                        <div key={g.key} className={gi > 0 ? "border-t border-soft-border/70 mt-1 pt-1" : ""}>
                            {g.label && (
                                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-soft-text">
                                    {g.label}
                                </div>
                            )}
                            {g.items.map((a) => {
                                const Icon = a.icon;
                                const isDanger = g.key === "danger" || a.tone === "danger";
                                return (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => { setOpen(false); a.onClick?.(); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-left transition-colors ${isDanger ? "text-red-600 hover:bg-red-50" : "text-strong-text hover:bg-medium-bg"}`}
                                    >
                                        {Icon && <Icon className="text-[11px] shrink-0" />}
                                        <span className="truncate">{a.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const CommandBar = ({ config, object, data, loading }) => {
    const { actionPending, goBack } = data;

    const title = loading
        ? "Chargement..."
        : (config.title ? config.title(object) : (object?.ref || config.label));

    // Resolve visible actions and split them into the three zones.
    const visible = (object && !loading)
        ? (config.actions || []).filter((a) => (a.visible ? a.visible(object, data) : true))
        : [];

    const primaries = visible.filter((a) => a.group === "primary");
    const primary = primaries[0] ?? null;
    const common = [...primaries.slice(1), ...visible.filter((a) => a.group === "common")];

    const overflowGroups = OVERFLOW_GROUPS.map((g) => ({
        ...g,
        items: visible
            .filter((a) => a.group === g.key)
            .map((a) => ({ id: a.id, label: a.label, icon: a.icon, tone: a.tone, onClick: a.run(data) })),
    }));

    const pills = (object && !loading && config.pills) ? config.pills(object, data) : [];

    return (
        <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
            <button
                type="button"
                onClick={goBack}
                className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                aria-label={config.backLabel || "Retour"}
                title={config.backLabel || "Retour"}
            >
                <FaArrowLeft className="text-sm" />
            </button>

            <h1 className="text-base font-bold text-strong-text truncate">{title}</h1>

            {pills.map((p, i) => (
                <StatusPill key={i} {...p} />
            ))}

            <span className="flex-1" />

            {object && !loading && (
                <div className="flex items-center gap-2">
                    {primary && (
                        <ActionButton
                            icon={primary.icon}
                            label={primary.label}
                            tone={primary.tone || "primary"}
                            onClick={primary.run(data)}
                            disabled={actionPending}
                        />
                    )}
                    {common.map((a) => (
                        <ActionButton
                            key={a.id}
                            icon={a.icon}
                            label={a.label}
                            tone={a.tone || "neutral"}
                            onClick={a.run(data)}
                            disabled={actionPending}
                        />
                    ))}
                    <OverflowMenu groups={overflowGroups} disabled={actionPending} />
                </div>
            )}
        </header>
    );
};
