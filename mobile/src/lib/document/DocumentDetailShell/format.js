// Shared display formatters for the document detail shell. Kept separate from
// each feature's useXxxData fmtAmount/fmtDate so the generic shell components
// (SummaryBand, InspectorRail) have a single, consistent money/date renderer.

export const fmtMoney = (value, currency = "EUR") => {
    const n = Number(value ?? 0);
    return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

// Dolibarr dates come over the wire as epoch seconds.
export const fmtDateFr = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

// Two-letter initials from a thirdparty name ("ACME Corp" -> "AC").
export const initialsOf = (name) => {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Standard Totaux rows (HT / TVA / TTC) consumed by config.sideRail.totalsRows.
// Most documents reuse it verbatim; invoices keep payment rows in their own
// Paiements tab so this stays a pure 3-line summary.
export const baseTotalsRows = (object) => [
    { label: "Total HT",  value: fmtMoney(object.totalHt) },
    { label: "TVA",       value: fmtMoney(object.totalTva) },
    { label: "Total TTC", value: fmtMoney(object.totalTtc), strong: true },
];
