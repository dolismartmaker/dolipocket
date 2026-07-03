// Single source of truth for Dolibarr document status labels and pill
// tones. Centralises what was previously duplicated as STATUS_LABELS +
// STATUS_PILL_CLASSES across five PageDetail desktop files and five
// listConfig files.
//
// Status codes are the native Dolibarr fk_statut values returned as-is by
// the dm<Doc> mappers. We do NOT renumber them: 0 = draft, 1 = validated,
// and so on. For Proposal we expose 3 = "Not signed" and 4 = "Billed" to
// match the legacy convention used inside Dolipocket pages (Dolibarr core
// stores those as -1 and "fully closed" respectively, but the mapper /
// hooks pages have always exposed the remapped values).
//
// `tone` is a semantic token resolved to Tailwind classes by the
// <StatusPill> component. Adding a new tone here MUST be paired with an
// entry in TONE_CLASSES below.
//
// Helper getStatusInfo(feature, status, extra?) is exported for non-React
// callers (CSV export, listConfig exportFormatter, etc).

export const TONE_CLASSES = {
    // bg / text pairs. Density tight, no shadow, no rounded-2xl.
    gray:    "bg-gray-100 text-gray-700",
    blue:    "bg-blue-100 text-blue-700",
    amber:   "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose:    "bg-rose-100 text-rose-700",
    violet:  "bg-violet-100 text-violet-700",
    red:     "bg-red-100 text-red-700",
    // muted is the default fallback when no mapping is found.
    muted:   "bg-gray-100 text-gray-500",
};

// Per-feature status code -> { label, tone }.
// Labels are the French defaults (the project ships FR with proper accents).
// English labels live in the i18n namespaces under "status-code.<n>".
// The component will use t() when provided, otherwise it falls back to the
// hard-coded label here.
export const STATUS_MAP = {
    proposal: {
        0: { label: "Brouillon",  tone: "gray"    },
        1: { label: "Validé",     tone: "blue"    },
        2: { label: "Signé",      tone: "emerald" },
        3: { label: "Non signé",  tone: "amber"   },
        4: { label: "Facturé",    tone: "violet"  },
    },
    order: {
        "-1": { label: "Annulée",   tone: "rose"    },
        0:    { label: "Brouillon", tone: "gray"    },
        1:    { label: "Validée",   tone: "blue"    },
        2:    { label: "En cours",  tone: "amber"   },
        3:    { label: "Livrée",    tone: "emerald" },
    },
    invoice: {
        0: { label: "Brouillon",  tone: "gray"    },
        1: { label: "Validée",    tone: "blue"    },
        2: { label: "Réglée",     tone: "emerald" },
        3: { label: "Abandonnée", tone: "rose"    },
    },
    // Customer shipment (Expedition). Native fk_statut values:
    // -1 canceled, 0 draft, 1 validated, 2 closed/processed.
    shipment: {
        "-1": { label: "Annulée",   tone: "rose"    },
        0:    { label: "Brouillon", tone: "gray"    },
        1:    { label: "Validée",   tone: "blue"    },
        2:    { label: "Traitée",   tone: "emerald" },
    },
    // Supplier reception (Reception). Native fk_statut values:
    // 0 draft, 1 validated, 2 closed/received.
    reception: {
        0: { label: "Brouillon", tone: "gray"    },
        1: { label: "Validée",   tone: "blue"    },
        2: { label: "Reçue",     tone: "emerald" },
    },
    supplierorder: {
        "-1": { label: "Annulée",                 tone: "muted"   },
        0:    { label: "Brouillon",               tone: "gray"    },
        1:    { label: "Validée",                 tone: "blue"    },
        2:    { label: "Approuvée",               tone: "emerald" },
        3:    { label: "Commandée",               tone: "violet"  },
        4:    { label: "Reçue partiellement",     tone: "amber"   },
        5:    { label: "Reçue",                   tone: "emerald" },
        6:    { label: "Annulée",                 tone: "rose"    },
        7:    { label: "Refusée",                 tone: "red"     },
        9:    { label: "Refusée",                 tone: "red"     },
    },
    supplierinvoice: {
        0: { label: "Brouillon",  tone: "gray"    },
        1: { label: "Validée",    tone: "blue"    },
        2: { label: "Réglée",     tone: "emerald" },
        3: { label: "Abandonnée", tone: "rose"    },
    },
    // Supplier price request (SupplierProposal). Native fk_statut values:
    // 0 draft, 1 validated, 2 signed, 3 not signed, 4 closed/billed.
    supplierproposal: {
        0: { label: "Brouillon",  tone: "gray"    },
        1: { label: "Validée",    tone: "blue"    },
        2: { label: "Signée",     tone: "emerald" },
        3: { label: "Non signée", tone: "amber"   },
        4: { label: "Fermée",     tone: "violet"  },
    },
    // Recurring invoice template (FactureRec). suspended flag: 0 active, 1 suspended.
    invoicerec: {
        0: { label: "Actif",     tone: "emerald" },
        1: { label: "Suspendu",  tone: "amber"   },
    },
    // Project (projet). Native fk_statut values: 0 draft, 1 open/validated,
    // 2 closed. Lot B1.
    project: {
        0: { label: "Brouillon", tone: "gray"    },
        1: { label: "Ouvert",    tone: "blue"    },
        2: { label: "Fermé",     tone: "emerald" },
    },
};

// Normalize the status key for lookup. Accepts numbers and strings,
// handles the `-1` case stored as "-1" key, and tolerates null/undefined.
const normalizeKey = (status) => {
    if (status === null || status === undefined || status === "") return null;
    const n = Number(status);
    if (!Number.isFinite(n)) return null;
    return String(n);
};

// Resolve label + tone for a given (feature, status). For invoice and
// supplierinvoice, when `extra.paid === true` we override the label/tone
// to a green "Payée" pill -- this surfaces the secondary `paye` boolean
// without forcing every caller to compose two pills.
export const getStatusInfo = (feature, status, extra = null) => {
    const map = STATUS_MAP[feature];
    const key = normalizeKey(status);
    const base = map && key !== null ? map[key] : null;

    // Paid override for client and supplier invoices. The Dolibarr `paye`
    // flag is set when the full amount has been received -- we want a
    // clear emerald pill rather than the generic "Validée" blue.
    if ((feature === "invoice" || feature === "supplierinvoice") && extra && extra.paid === true) {
        return { label: "Payée", tone: "emerald", paidOverride: true };
    }

    if (base) {
        return { ...base, paidOverride: false };
    }
    return { label: "?", tone: "muted", paidOverride: false };
};

// Convenience helper for callers that only want the tailwind class string.
export const getStatusToneClasses = (tone) => TONE_CLASSES[tone] ?? TONE_CLASSES.muted;
