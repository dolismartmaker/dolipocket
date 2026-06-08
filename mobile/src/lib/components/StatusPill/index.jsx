import {
    getStatusInfo, getStatusToneClasses, TONE_CLASSES,
} from "./statusMap";

// Map a Dolipocket feature key to the i18n namespace where the
// "status-code.<n>" keys live. We keep this here (not in statusMap) so
// statusMap stays pure data with zero i18n knowledge.
const FEATURE_TO_NS = {
    proposal:         "proposals",
    order:            "orders",
    invoice:          "invoices",
    supplierorder:    "supplier-orders",
    supplierinvoice:  "supplier-invoices",
};

// Resolve the translated label for (feature, status). When `t` is not
// provided, or when the key is missing in the namespace, we fall back to
// the hard-coded French label from statusMap.
const resolveTranslatedLabel = (t, feature, status, fallback) => {
    if (typeof t !== "function") return fallback;
    const ns = FEATURE_TO_NS[feature];
    if (!ns) return fallback;
    const key = `${ns}:status-code.${status}`;
    const translated = t(key, { defaultValue: null });
    if (translated && translated !== key) return translated;
    return fallback;
};

// Generic status pill used across the five document features (Proposal,
// Order, Invoice, SupplierOrder, SupplierInvoice).
//
// Usage:
//     <StatusPill feature="proposal" status={1} />
//     <StatusPill feature="invoice" status={1} paid />
//     <StatusPill label="Custom" tone="amber" />   // total override
//
// The component is intentionally tiny: it only reads the central
// statusMap and renders a span with density-tight Tailwind classes.
// All resolution lives in statusMap.js so non-React callers (CSV export,
// listConfig.exportFormatter) can reuse the exact same mapping via
// getStatusInfo().
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium
//   - no shadow-sm
//   - no rounded-2xl / rounded-full inflation
//   - single source of colour via TONE_CLASSES (Tailwind canonical palette)

const PILL_CLASSES = "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap";

export const StatusPill = ({
    feature,
    status,
    paid,
    label: labelOverride,
    tone: toneOverride,
    t,
    className = "",
}) => {
    // Total override path: caller already knows the label and tone.
    if (labelOverride !== undefined) {
        const tone = toneOverride ?? "gray";
        const toneClasses = getStatusToneClasses(tone);
        return (
            <span className={`${PILL_CLASSES} ${toneClasses} ${className}`}>
                {labelOverride}
            </span>
        );
    }

    // Feature-driven path. paid is consumed only when the feature is
    // invoice / supplierinvoice (cf getStatusInfo override logic).
    const extra = (paid !== undefined && paid !== null) ? { paid: !!paid } : null;
    const info = getStatusInfo(feature, status, extra);
    const tone = toneOverride ?? info.tone;
    const toneClasses = TONE_CLASSES[tone] ?? TONE_CLASSES.muted;

    // When `paid` is true the caller already gets the "Payée" override
    // label which is the same in FR/EN. For all other cases, we try the
    // namespace translation when a `t` function was passed (a caller
    // using react-i18next can pass useTranslation().t directly).
    const label = info.paidOverride
        ? info.label
        : resolveTranslatedLabel(t, feature, status, info.label);

    return (
        <span className={`${PILL_CLASSES} ${toneClasses} ${className}`}>
            {label}
        </span>
    );
};

// Re-export the resolver so callers can do
//   import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";
export { getStatusInfo, getStatusToneClasses, TONE_CLASSES, STATUS_MAP } from "./statusMap";
