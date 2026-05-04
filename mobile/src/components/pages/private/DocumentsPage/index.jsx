import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaBuilding, FaBox, FaProjectDiagram, FaTools, FaTags, FaSearch } from "react-icons/fa";

import { Page, useStates } from "@cap-rel/smartcommon";

// Object types supported by SmartAuth ObjectDocumentController.
// Each entry exposes a label, an icon, and the slug used in the URL.
const OBJECT_TYPES = [
    { type: "thirdparty", label: "Tiers", icon: FaBuilding, color: "text-blue-700 bg-blue-100" },
    { type: "product", label: "Produits", icon: FaBox, color: "text-amber-700 bg-amber-100" },
    { type: "project", label: "Projets", icon: FaProjectDiagram, color: "text-emerald-700 bg-emerald-100" },
    { type: "intervention", label: "Interventions", icon: FaTools, color: "text-purple-700 bg-purple-100" },
    { type: "category", label: "Catégories", icon: FaTags, color: "text-pink-700 bg-pink-100" },
];

export const DocumentsPage = () => {
    const navigate = useNavigate();

    const { states, set } = useStates({
        selectedType: "thirdparty",
        objectId: "",
    });

    const { selectedType, objectId } = states ?? {};

    const handleBack = () => navigate("/");

    const handleSubmit = (e) => {
        e?.preventDefault?.();
        const id = parseInt(objectId, 10);
        if (!id || id <= 0) return;
        navigate(`/documents/${selectedType}/${id}`);
    };

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10 md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Documents</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{"GED par type d'objet"}</p>
                    </div>
                </div>
            </div>

            <div className="p-4 pb-24 space-y-4 md:px-6 md:max-w-5xl md:mx-auto">
                {/* Type chips */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                        {"Type d'objet"}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                        {OBJECT_TYPES.map((t) => {
                            const isActive = selectedType === t.type;
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.type}
                                    type="button"
                                    onClick={() => set("selectedType", t.type)}
                                    className={`p-3 rounded-lg flex items-center gap-2 transition-all border ${
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

                {/* Object id form */}
                <form
                    onSubmit={handleSubmit}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 space-y-3"
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
                                placeholder={`ID du ${OBJECT_TYPES.find(o => o.type === selectedType)?.label?.toLowerCase() ?? "tiers"}`}
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

                {/* Help block */}
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
