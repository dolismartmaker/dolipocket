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

// Dolibarr note_public / note_private fields are stored HTML-encoded (the
// WYSIWYG editor, or generators like SmartInterventions, emit entities such as
// "&eacute;" and tags such as "<br>"). Rendered as a raw React text node they
// show literally ("G&eacute;n&eacute;r&eacute;"). This turns such a note into
// clean readable plain text: block tags -> newlines, remaining well-formed tags
// stripped, then entities decoded. The result is rendered as TEXT (no
// dangerouslySetInnerHTML), so there is no XSS surface.
//
// The tag regex requires a letter right after "<" or "</", so a literal
// comparison like "a < b" is preserved (it is not mistaken for a tag).
export const noteToText = (raw) => {
    if (typeof raw !== "string" || raw === "") return raw ?? "";
    let s = raw
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
        .replace(/<\/?[a-zA-Z][^>]*>/g, "");
    if (typeof document !== "undefined") {
        const el = document.createElement("textarea");
        el.innerHTML = s;
        s = el.value;
    }
    return s.replace(/\n{3,}/g, "\n\n").trim();
};

// Standard Totaux rows (HT / TVA / TTC) consumed by config.sideRail.totalsRows.
// Most documents reuse it verbatim; invoices keep payment rows in their own
// Paiements tab so this stays a pure 3-line summary.
export const baseTotalsRows = (object) => [
    { label: "Total HT",  value: fmtMoney(object.totalHt) },
    { label: "TVA",       value: fmtMoney(object.totalTva) },
    { label: "Total TTC", value: fmtMoney(object.totalTtc), strong: true },
];
