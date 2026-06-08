import { FaArrowLeft, FaPen, FaTrash, FaWarehouse, FaMapMarkerAlt, FaPhone, FaFax } from "react-icons/fa";

import { Page, Button } from "@cap-rel/smartcommon";

// Mobile rendering of the warehouse detail page. Extracted verbatim from
// the previous monolithic index.jsx -- visually unchanged on mobile. Data
// and handlers come from useWarehouseData via props.
export const WarehousePageMobile = (props) => {
    const {
        warehouse, loading, error, deleting,
        handleBack, handleEdit, handleDelete, handleStockNav,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {loading ? "Chargement..." : warehouse?.label || warehouse?.ref || "Entrepôt"}
                        </h1>
                        {warehouse?.lieu && (
                            <p className="text-sm text-white/80">{warehouse.lieu}</p>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : error ? (
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : warehouse ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                                <FaWarehouse className="text-primary" />
                                <span>{warehouse.label || warehouse.ref}</span>
                                {Number(warehouse.statut) !== 1 && (
                                    <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Fermé</span>
                                )}
                            </div>

                            {warehouse.description && (
                                <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{warehouse.description}</p>
                            )}

                            {(warehouse.address || warehouse.zip || warehouse.town) && (
                                <div className="text-sm text-gray-700 mb-2 flex items-start gap-2">
                                    <FaMapMarkerAlt className="text-gray-400 mt-1 flex-shrink-0" />
                                    <div>
                                        {warehouse.address && <div>{warehouse.address}</div>}
                                        <div>
                                            {warehouse.zip} {warehouse.town}
                                            {warehouse.countryCode ? ` (${warehouse.countryCode})` : ""}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {warehouse.phone && (
                                <div className="text-sm text-gray-700 flex items-center gap-2">
                                    <FaPhone className="text-gray-400" /> {warehouse.phone}
                                </div>
                            )}
                            {warehouse.fax && (
                                <div className="text-sm text-gray-700 flex items-center gap-2">
                                    <FaFax className="text-gray-400" /> {warehouse.fax}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleStockNav}
                            className="bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-primary"
                        >
                            <div className="text-sm font-medium text-primary">Voir l'inventaire de cet entrepôt</div>
                        </button>
                    </div>

                    {/* Mobile actions */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            onClick={handleDelete}
                            loading={deleting}
                            icon={FaTrash}
                            buttonProps={{ className: "flex-1 py-3 bg-red-100 text-red-600 rounded-xl flex items-center justify-center gap-2 font-medium" }}
                        >
                            Supprimer
                        </Button>
                        <Button
                            onClick={handleEdit}
                            icon={FaPen}
                            buttonProps={{ className: "flex-1 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium" }}
                        >
                            Modifier
                        </Button>
                    </div>
                </div>
            ) : null}
        </Page>
    );
};
