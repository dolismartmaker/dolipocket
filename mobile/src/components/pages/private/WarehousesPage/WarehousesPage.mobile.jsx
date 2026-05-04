import { FaArrowLeft, FaPlus, FaWarehouse, FaMapMarkerAlt } from "react-icons/fa";

import { Page, Input } from "@cap-rel/smartcommon";

// Mobile rendering of the warehouses list. Presentational only (no fetch,
// no useDb*, no useApi). All data and handlers come from useWarehousesData()
// via props.

export const WarehousesPageMobile = (props) => {
    const {
        navigate,
        items, loading, error, query,
        set, loadItems,
    } = props;

    const handleBack = () => {
        navigate("/");
    };

    const handleOpen = (id) => {
        navigate(`/warehouses/${id}`);
    };

    const handleCreate = () => {
        navigate("/warehouses/new");
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Entrepots</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{items?.length ?? 0} entrepots</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="p-2 bg-white/20 md:bg-primary md:text-white rounded-full"
                        aria-label="Creer"
                    >
                        <FaPlus />
                    </button>
                </div>
            </div>

            <div className="p-4 md:px-6 md:max-w-5xl md:mx-auto flex flex-col gap-3">
                <div className="md:max-w-sm">
                    <Input
                        label="Recherche"
                        value={query ?? ""}
                        onChange={(value) => set("query", value)}
                        inputProps={{ placeholder: "Reference, libelle, lieu..." }}
                    />
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Chargement...</div>
                ) : error ? (
                    <div className="p-4 bg-red-100 text-red-700 rounded-lg">
                        {error}
                        <button onClick={loadItems} className="ml-2 underline">Reessayer</button>
                    </div>
                ) : (items?.length ?? 0) === 0 ? (
                    <div className="p-8 text-center text-gray-500">Aucun entrepot</div>
                ) : (
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleOpen(item.id)}
                                className="bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-primary md:transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <FaWarehouse className="text-primary text-xl flex-shrink-0 mt-1" />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-800">{item.label || item.ref}</div>
                                        {item.lieu && (
                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                <FaMapMarkerAlt /> {item.lieu}
                                            </div>
                                        )}
                                        {item.town && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                {item.zip} {item.town}
                                            </div>
                                        )}
                                    </div>
                                    {Number(item.statut) !== 1 && (
                                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Ferme</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Page>
    );
};
