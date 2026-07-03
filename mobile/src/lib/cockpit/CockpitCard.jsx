import { FaArrowsRotate } from "react-icons/fa6";

// Shared shell for every cockpit card. Enforces the "Conventions UI desktop
// épurées" (cf .claude/CLAUDE.md): bg-white rounded-xl border (no shadow),
// header separated by border-b, density tight, transition-colors only.
//
// Props:
//   icon       FA6 component, optional leading icon.
//   title      string, required.
//   count      number|null, optional badge shown next to the title.
//   action     node, optional right-aligned control (e.g. a link button).
//   onRefresh  fn, optional -> renders a spin-on-loading refresh button.
//   loading    bool, drives the refresh spinner.
//   className  string, extra classes on the outer <section>.
export const CockpitCard = ({
    icon: Icon,
    title,
    count,
    action,
    onRefresh,
    loading = false,
    className = "",
    children,
}) => (
    <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-soft-border">
            <div className="flex items-center gap-2 min-w-0">
                {Icon && <Icon className="text-soft-text text-sm shrink-0" />}
                <h2 className="text-sm font-semibold text-strong-text truncate">{title}</h2>
                {count !== undefined && count !== null && (
                    <span className="text-[11px] text-soft-text shrink-0">({count})</span>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {action}
                {onRefresh && (
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                        aria-label="Rafraîchir"
                    >
                        <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                    </button>
                )}
            </div>
        </header>
        {children}
    </section>
);
