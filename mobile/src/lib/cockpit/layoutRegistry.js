// Declarative registry of the thirdparty cockpit boxes. PURE DATA -- no React,
// no JSX, no HTTP -- so it can be persisted, diffed and (Phase 3) shared with
// smartcommon. The id -> component render mapping lives in ThirdPartyCockpit
// (it needs navigate/data/permissions), the registry only describes the boxes.
//
// Per box:
//   id            stable key, used in prefs and as the DnD payload.
//   label         FR label shown in the edit chrome / collapsed stub / drawer.
//   kind          "list"   -> the box renders a limitable list (5/10/20/all).
//                 "static" -> fixed content, no length control.
//   defaultVisible / defaultWidth ("normal" | "full") / defaultLimit
//   permission    optional cockpit permission key gating availability
//                 (mirrors the server truth in data.permissions).
//   requiresNote  the Notes box only exists when the thirdparty has a note.
//
// The default display order is the array order below.

// Length options offered for a "list" box in edit mode. "all" is capped by the
// server payload (25 rows max, cf ThirdPartyController::cockpit), so "Tout"
// really means "up to what the server returned".
export const LIST_LIMIT_OPTIONS = [5, 10, 20, "all"];

export const listLimitLabel = (value) => (value === "all" ? "Tout" : String(value));

// Resolve a stored limit value into a slice count. "all" (or anything
// non-finite) becomes Infinity so the card shows every returned row.
export const resolveLimit = (value, fallback = 5) => {
    if (value === "all") return Infinity;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const THIRDPARTY_COCKPIT_BOXES = [
    { id: "coordinates", label: "Coordonnées", kind: "static", defaultVisible: true, defaultWidth: "normal" },
    { id: "sales", label: "Activité commerciale", kind: "static", defaultVisible: true, defaultWidth: "normal" },
    { id: "unpaid", label: "Factures impayées", kind: "list", defaultVisible: true, defaultWidth: "normal", defaultLimit: 10, permission: "invoice" },
    { id: "caChart", label: "Évolution du chiffre d'affaires", kind: "static", defaultVisible: true, defaultWidth: "normal", permission: "invoice" },
    { id: "recentInvoices", label: "Dernières factures", kind: "list", defaultVisible: true, defaultWidth: "normal", defaultLimit: 5, permission: "invoice" },
    { id: "contacts", label: "Contacts", kind: "list", defaultVisible: true, defaultWidth: "normal", defaultLimit: 5, permission: "contact" },
    { id: "events", label: "Derniers événements", kind: "list", defaultVisible: true, defaultWidth: "normal", defaultLimit: 5, permission: "agenda" },
    { id: "notes", label: "Notes", kind: "static", defaultVisible: true, defaultWidth: "normal", requiresNote: true },
    { id: "categories", label: "Catégories", kind: "static", defaultVisible: true, defaultWidth: "normal" },
    { id: "bank", label: "Comptes bancaires", kind: "static", defaultVisible: true, defaultWidth: "normal" },
];
