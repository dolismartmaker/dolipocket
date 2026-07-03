// Shared text helpers for Dolibarr HTML-encoded fields.
//
// note_public / note_private (and other rich-text fields) are stored
// HTML-encoded: the WYSIWYG editor, or generators like SmartInterventions,
// emit entities such as "&eacute;" and tags such as "<br>". Rendered as a raw
// React text node they show literally ("G&eacute;n&eacute;r&eacute;").
//
// noteToText turns such a value into clean readable plain text: block tags ->
// newlines, remaining well-formed tags stripped, then entities decoded. The
// result is meant to be rendered as TEXT (never dangerouslySetInnerHTML), so
// there is no XSS surface.
//
// The tag regex requires a letter right after "<" or "</", so a literal
// comparison like "a < b" is preserved (not mistaken for a tag).
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
