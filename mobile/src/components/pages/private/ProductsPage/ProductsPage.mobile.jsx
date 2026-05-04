import { FaArrowLeft, FaPlus, FaBox, FaWrench, FaBarcode } from "react-icons/fa";

import { Page, Input } from "@cap-rel/smartcommon";

// Mobile rendering of the products list. Presentational only (no fetch,
// no useDb*, no useApi). All data and handlers come from useProductsData()
// via props.

export const ProductsPageMobile = (props) => {
    const {
        navigate,
        items, loading, error, type, query,
        set, loadItems,
    } = props;

    const handleBack = () => {
        navigate("/");
    };

    const handleOpen = (id) => {
        navigate(`/products/${id}`);
    };

    const handleCreate = () => {
        navigate("/products/new");
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Produits et services</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{items?.length ?? 0} elements</p>
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
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => set("type", 0)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                                type === 0 ? "bg-primary text-white" : "bg-white text-gray-700 border border-gray-200"
                            }`}
                        >
                            <FaBox /> Produits
                        </button>
                        <button
                            onClick={() => set("type", 1)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                                type === 1 ? "bg-primary text-white" : "bg-white text-gray-700 border border-gray-200"
                            }`}
                        >
                            <FaWrench /> Services
                        </button>
                        <button
                            onClick={() => set("type", null)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                type === null ? "bg-primary text-white" : "bg-white text-gray-700 border border-gray-200"
                            }`}
                        >
                            Tout
                        </button>
                    </div>

                    <div className="md:flex-1 md:max-w-sm">
                        <Input
                            label="Recherche"
                            value={query ?? ""}
                            onChange={(value) => set("query", value)}
                            inputProps={{ placeholder: "Reference, libelle, code-barres..." }}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-gray-500">Chargement...</div>
                ) : error ? (
                    <div className="p-4 bg-red-100 text-red-700 rounded-lg">
                        {error}
                        <button onClick={loadItems} className="ml-2 underline">Reessayer</button>
                    </div>
                ) : (items?.length ?? 0) === 0 ? (
                    <div className="p-8 text-center text-gray-500">Aucun element</div>
                ) : (
                    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleOpen(item.id)}
                                className="bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-primary md:transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            {item.type === 1 ? (
                                                <FaWrench className="text-purple-500 flex-shrink-0" />
                                            ) : (
                                                <FaBox className="text-blue-500 flex-shrink-0" />
                                            )}
                                            <span className="font-medium text-gray-800 truncate">{item.label}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">{item.ref}</div>
                                        {item.barcode && (
                                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                                <FaBarcode /> {item.barcode}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <div className="text-sm font-semibold text-gray-800">
                                            {Number(item.price ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                                        </div>
                                        {item.type === 0 && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                Stock: {Number(item.stockReel ?? 0)}
                                            </div>
                                        )}
                                        {item.status === 0 && (
                                            <div className="text-xs text-red-500 mt-1">Inactif</div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Page>
    );
};
