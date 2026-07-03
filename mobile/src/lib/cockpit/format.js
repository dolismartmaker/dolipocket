// Pure formatting helpers for the thirdparty cockpit cards. No React, no HTTP.
// Dates coming from the backend cockpit payload are Unix epoch SECONDS.

// Format a monetary amount with the tenant currency (Intl, fr-FR locale).
export const formatCurrency = (value, currency = "EUR") => {
    const n = Number(value) || 0;
    try {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: currency || "EUR",
            maximumFractionDigits: 2,
        }).format(n);
    } catch {
        return `${n.toFixed(2)} ${currency || "EUR"}`;
    }
};

// Compact amount for chart axis labels (1.2k, 540, 1.5M).
export const formatCompact = (value) => {
    const n = Number(value) || 0;
    const abs = Math.abs(n);
    if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
    return String(Math.round(n));
};

// Format an epoch (seconds) as a short fr date. Returns "-" when absent.
export const formatDate = (epochSeconds) => {
    const ts = Number(epochSeconds) || 0;
    if (ts <= 0) return "-";
    try {
        return new Intl.DateTimeFormat("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(new Date(ts * 1000));
    } catch {
        return "-";
    }
};

// Compose a contact display name from firstname/lastname.
export const contactName = (c) => {
    const parts = [c?.firstname, c?.lastname].map((p) => (p || "").trim()).filter(Boolean);
    return parts.length ? parts.join(" ") : "-";
};
