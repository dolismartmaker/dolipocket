import { FaSearch } from "react-icons/fa";

// Desktop documents picker. Plain flex container filling the AppShell <main>
// (no <Page> grid). Sticky toolbar header, then a single constrained panel
// (type selector + object id form + help). Épuré UI conventions: one bordered
// card, sections split by internal borders, no shadow (cf .claude/CLAUDE.md).
export const DocumentsPageDesktop = (props) => {
    const { objectTypes, selectedType, objectId, set, handleSubmit } = props;

    const activeLabel = objectTypes.find((o) => o.type === selectedType)?.label?.toLowerCase() ?? "tiers";

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex items-baseline gap-2 px-4 py-2 border-b border-soft-border bg-white">
                <h1 className="text-base font-bold text-strong-text">Documents</h1>
                <span className="text-[13px] text-gray-500">{"GED par type d'objet"}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                <div className="max-w-2xl mx-auto bg-white rounded-xl border border-soft-border overflow-hidden">
                    <section>
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <h2 className="text-[13px] font-semibold text-strong-text">{"Type d'objet"}</h2>
                        </header>
                        <div className="p-4 grid grid-cols-3 gap-2">
                            {objectTypes.map((t) => {
                                const isActive = selectedType === t.type;
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.type}
                                        type="button"
                                        onClick={() => set("selectedType", t.type)}
                                        className={`p-2.5 rounded-md flex items-center gap-2 border transition-colors ${
                                            isActive
                                                ? "border-primary bg-primary/5"
                                                : "border-soft-border bg-white hover:bg-gray-50"
                                        }`}
                                    >
                                        <span className={`p-1.5 rounded-md ${t.color}`}>
                                            <Icon className="text-sm" />
                                        </span>
                                        <span className="text-[13px] font-medium text-strong-text">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="border-t border-soft-border">
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <h2 className="text-[13px] font-semibold text-strong-text">{"Identifiant de l'objet"}</h2>
                        </header>
                        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-2">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        value={objectId}
                                        onChange={(e) => set("objectId", e.target.value)}
                                        placeholder={`ID du ${activeLabel}`}
                                        className="w-full h-[34px] pl-9 pr-3 rounded border border-soft-border text-[13px] text-strong-text focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!objectId || parseInt(objectId, 10) <= 0}
                                    className="h-[34px] px-4 rounded text-[13px] bg-primary text-white hover:bg-primary/90 disabled:opacity-50 font-medium transition-colors"
                                >
                                    Voir
                                </button>
                            </div>
                            <p className="text-[12px] text-gray-500">
                                {"Saisissez l'identifiant numérique de l'objet pour lister ses documents."}
                            </p>
                        </form>
                    </section>

                    <div className="border-t border-soft-border bg-blue-50/60 px-4 py-3">
                        <p className="text-[13px] text-blue-800">
                            Cette page permet de consulter et téléverser les documents attachés
                            à un objet Dolibarr (tiers, produit, projet, intervention, catégorie).
                            Les listes par catégorie seront ajoutées au fur et à mesure des autres lots.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentsPageDesktop;
