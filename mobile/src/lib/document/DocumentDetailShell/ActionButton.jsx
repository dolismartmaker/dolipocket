// Single semantic action button used across every document command bar.
// Replaces the ~60 hand-written <button> blocks that were duplicated across
// the six *.desktop.jsx document pages, each with its own inline class soup.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md): density tight
// (h-[28px]), no shadow, no rounded-2xl, no active:, transition-colors only.

const TONE_CLASSES = {
    primary: "bg-primary text-white hover:bg-primary/90",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    info:    "bg-blue-600 text-white hover:bg-blue-700",
    slate:   "bg-slate-700 text-white hover:bg-slate-800",
    neutral: "bg-white border border-soft-border text-strong-text hover:bg-medium-bg",
    danger:  "bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300",
};

export const ActionButton = ({
    icon: Icon,
    label,
    tone = "neutral",
    onClick,
    disabled = false,
    title,
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title || label}
        className={`h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 disabled:opacity-50 transition-colors ${TONE_CLASSES[tone] ?? TONE_CLASSES.neutral}`}
    >
        {Icon && <Icon className="text-[11px]" />}
        <span>{label}</span>
    </button>
);
