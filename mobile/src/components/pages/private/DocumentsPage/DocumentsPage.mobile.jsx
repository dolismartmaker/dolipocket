import { FaArrowLeft, FaSearch } from "react-icons/fa";

import { Page } from "@cap-rel/smartcommon";

// Mobile documents picker: gradient header, type chips, object id form, help.
// Presentational only -- state + handlers come from useDocumentsData() (cf
// .claude/CLAUDE.md viewport-aware pattern).
export const DocumentsPageMobile = (props) => {
    const { objectTypes, selectedType, objectId, set, handleBack, handleSubmit } = props;

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Documents</h1>
                        <p className="text-sm text-white/80">{"GED par type d'objet"}</p>
                    </div>
                </div>
            </div>

            <div className="p-4 pb-24 space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                        {"Type d'objet"}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {objectTypes.map((t) => {
                            const isActive = selectedType === t.type;
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.type}
                                    type="button"
                                    onClick={() => set("selectedType", t.type)}
                                    className={`p-3 rounded-lg flex items-center gap-2 transition-colors border ${
                                        isActive
                                            ? "border-primary bg-primary/5"
                                            : "border-gray-200 bg-white"
                                    }`}
                                >
                                    <span className={`p-2 rounded-lg ${t.color}`}>
                                        <Icon />
                                    </span>
                                    <span className="text-sm font-medium text-gray-700">
                                        {t.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-white rounded-xl border border-gray-200 p-3 space-y-3"
                >
                    <div className="text-xs font-medium text-gray-500 uppercase">
                        {"Identifiant de l'objet"}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                value={objectId}
                                onChange={(e) => set("objectId", e.target.value)}
                                placeholder={`ID du ${objectTypes.find((o) => o.type === selectedType)?.label?.toLowerCase() ?? "tiers"}`}
                                className="w-full pl-10 pr-3 py-2 rounded-lg text-gray-800 bg-gray-50 border border-gray-200 focus:outline-none focus:border-primary"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!objectId || parseInt(objectId, 10) <= 0}
                            className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 font-medium"
                        >
                            Voir
                        </button>
                    </div>
                    <p className="text-xs text-gray-500">
                        {"Saisissez l'identifiant numérique de l'objet pour lister ses documents."}
                    </p>
                </form>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <p className="text-sm text-blue-800">
                        Cette page permet de consulter et téléverser les documents attachés
                        à un objet Dolibarr (tiers, produit, projet, intervention, catégorie).
                        Les listes par catégorie seront ajoutées au fur et à mesure des autres lots.
                    </p>
                </div>
            </div>
        </Page>
    );
};

export default DocumentsPageMobile;
