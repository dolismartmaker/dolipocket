// Maps the catalog field `type` (normalised Dolibarr type, cf .claude/CLAUDE.md
// "Mapping types Dolibarr -> types front") to an inline editor kind. Returns
// null for types we cannot safely edit inline yet (select / sellist / FK /
// date / html / password): those stay read-only and are edited via the full
// AutoForm ("Modifier"). A conservative whitelist means a field only gets a
// pencil when we can render a correct editor for it.
//
// Kept in its own module (not in the component file) so InlineFieldEditor.jsx
// only exports a component (react-refresh fast-refresh constraint).
export const editorKindForType = (type) => {
    const t = String(type || "").toLowerCase();
    if (t === "text") return "textarea";
    if (t === "mail" || t === "email") return "email";
    if (t === "phone" || t === "phonenumber" || t === "tel") return "tel";
    if (t === "url") return "url";
    if (t === "boolean") return "boolean";
    if (["int", "integer", "double", "float", "real", "price"].includes(t)) return "number";
    if (t === "string" || t.indexOf("varchar") === 0) return "text";
    return null;
};
