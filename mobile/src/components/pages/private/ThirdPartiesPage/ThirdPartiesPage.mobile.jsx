import { FaArrowLeft, FaPlus, FaSearch, FaBuilding } from "react-icons/fa";

import { Page } from "@cap-rel/smartcommon";

const FILTERS = [
    { key: "all", label: "Tous" },
    { key: "client", label: "Clients" },
    { key: "fournisseur", label: "Fournisseurs" },
];

// Mobile rendering of the third parties list. Presentational only.

export const ThirdPartiesPageMobile = (props) => {
    const {
        navigate,
        items, loading, error, q, filter, page,
        set, loadThirdParties,
    } = props;

    const handleBack = () => navigate("/");
    const handleCreate = () => navigate("/thirdparties/new");
    const handleOpen = (id) => navigate(`/thirdparties/${id}`);

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Tiers</h1>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="p-2 bg-white/20 rounded-full"
                        aria-label="Créer un tiers"
                    >
                        <FaPlus />
                    </button>
                </div>

                <div className="mt-3 flex flex-col">
                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => set("q", e.target.value)}
                            placeholder="Rechercher un tiers..."
                            className="w-full pl-10 pr-3 py-2 rounded-lg text-gray-800 bg-white focus:outline-none"
                        />
                    </div>
                    <div className="mt-3 flex gap-2">
                        {FILTERS.map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => set("filter", f.key)}
                                className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                                    filter === f.key
                                        ? "bg-white text-primary"
                                        : "bg-white/20 text-white"
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-4 pb-app-base">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">
                        {error}
                        <button onClick={() => loadThirdParties(1)} className="ml-2 underline">
                            Réessayer
                        </button>
                    </div>
                )}

                {loading && items?.length === 0 && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {!loading && items?.length === 0 && !error && (
                    <div className="text-center text-gray-500 py-12">
                        <FaBuilding className="mx-auto text-4xl mb-3 text-gray-300" />
                        <div>Aucun tiers</div>
                    </div>
                )}

                <ul className="flex flex-col gap-2">
                    {items?.map((tp) => (
                        <li key={tp.id}>
                            <button
                                type="button"
                                onClick={() => handleOpen(tp.id)}
                                className="w-full text-left bg-white p-3 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="bg-primary/10 text-primary p-2 rounded-lg">
                                        <FaBuilding />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-800 truncate">
                                            {tp.name || "(sans nom)"}
                                        </div>
                                        {tp.nameAlias && (
                                            <div className="text-sm text-gray-500 truncate">
                                                {tp.nameAlias}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {!!tp.client && tp.client > 0 && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                    Client
                                                </span>
                                            )}
                                            {!!tp.fournisseur && (
                                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                    Fournisseur
                                                </span>
                                            )}
                                        </div>
                                        {(tp.email || tp.phone) && (
                                            <div className="text-xs text-gray-500 mt-1 truncate">
                                                {tp.email}
                                                {tp.email && tp.phone && " - "}
                                                {tp.phone}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>

                {items?.length >= 50 && (
                    <div className="flex justify-center gap-2 mt-4">
                        <button
                            type="button"
                            onClick={() => loadThirdParties(Math.max(1, page - 1))}
                            disabled={page <= 1 || loading}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Précédent
                        </button>
                        <button
                            type="button"
                            onClick={() => loadThirdParties(page + 1)}
                            disabled={loading}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Suivant
                        </button>
                    </div>
                )}
            </div>
        </Page>
    );
};
