import { useMemo, useState } from "react";
import { FaSliders } from "react-icons/fa6";

import { useColumnCatalog } from "../DataTable/hooks/useColumnCatalog";
import { LinesColumnPanel } from "../DocumentLinesTable/LinesColumnPanel";

import { useDocumentHeaderPrefs } from "./useDocumentHeaderPrefs";

// <DocumentHeaderFields> renders the header information of a document
// as a vertical list of "label : value" pairs, driven by the same backend
// catalog (GET /<feature>/columns) used by the listing DataTable. The user
// can choose which fields to display and their order via an embedded
// "Champs" panel.
//
// API contract:
//   <DocumentHeaderFields
//       object={proposal}                          // header object (camelCase keys)
//       feature="proposal"                         // catalog cache namespace
//       dataSource={ds}                            // must expose .columns({signal})
//       storageKey="dolipocket.proposalpage.header"
//       title="Informations"                       // default = "Informations"
//       overrides={{ key: { defaultVisible, formatter, label } }}
//   />
//
// Conventions UI épurées : pas de double-encadrement, density tight,
// border-b inter-rows, pas de shadow, pas de transition-all.

const renderValue = (field, object) => {
    const value = object?.[field.key];
    if (typeof field.formatter === "function") {
        try {
            const out = field.formatter(value, object);
            if (out === null || out === undefined || out === "") return "-";
            return out;
        } catch (e) {
            console.error("[DocumentHeaderFields] formatter error", field.key, e);
            return "-";
        }
    }
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "object") return "-";
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    return String(value);
};

export const DocumentHeaderFields = ({
    object,
    feature,
    dataSource,
    storageKey,
    title = "Informations",
    overrides,
}) => {
    const { catalog, loading: catalogLoading, error: catalogError } = useColumnCatalog({
        dataSource,
        feature,
    });

    const {
        prefs,
        available,
        resolvedFields,
        setColumnVisibility,
        moveColumn,
        resetAll,
    } = useDocumentHeaderPrefs({ storageKey, catalog, overrides });

    const [isPanelOpen, setIsPanelOpen] = useState(false);

    const visibleFields = useMemo(
        () => resolvedFields.filter((f) => f.visible !== false),
        [resolvedFields],
    );

    return (
        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
            <header className="px-4 py-2.5 border-b border-soft-border flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-strong-text">{title}</h2>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={() => setIsPanelOpen((v) => !v)}
                    className={`h-[26px] px-3 rounded text-[12px] flex items-center gap-1 border ${isPanelOpen ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-white border-soft-border text-strong-text hover:bg-medium-bg"}`}
                    title="Choisir les champs à afficher"
                    aria-label="Configurer les champs"
                >
                    <FaSliders className="text-[11px]" />
                    <span>Champs</span>
                </button>
            </header>

            {isPanelOpen && (
                <LinesColumnPanel
                    title="Champs affichés"
                    available={available}
                    prefsColumns={prefs.columns}
                    onVisibilityToggle={setColumnVisibility}
                    onMove={moveColumn}
                    onClose={() => setIsPanelOpen(false)}
                    onReset={resetAll}
                />
            )}

            {catalogError && !catalog && (
                <div className="px-3 py-1.5 text-[12px] text-amber-900 bg-amber-50 border-b border-amber-200">
                    Catalogue de champs indisponible (erreur réseau), affichage par défaut.
                </div>
            )}

            {catalogLoading && visibleFields.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-soft-text">
                    Chargement du catalogue...
                </div>
            )}

            {!catalogLoading && visibleFields.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-soft-text">
                    Aucun champ à afficher
                </div>
            )}

            {visibleFields.length > 0 && (
                <div className="px-4 py-2 divide-y divide-soft-border/60">
                    {visibleFields.map((field) => (
                        <div key={field.key} className="flex justify-between gap-4 py-1.5 text-[13px]">
                            <span className="text-soft-text shrink-0">{field.label}</span>
                            <span className="text-strong-text font-medium text-right truncate">
                                {renderValue(field, object)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};
