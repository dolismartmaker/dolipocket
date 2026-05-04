import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaWarehouse, FaMapMarkerAlt, FaPhone, FaFax } from "react-icons/fa";

import { Page, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";

/**
 * WarehousePage: read-only detail view of a warehouse with edit/delete actions.
 */
export const WarehousePage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const dbWarehouses = useDbWarehouses();
    const { confirm } = useConfirm();
    const hasClient = !!dbWarehouses.list;

    const { states, set } = useStates({
        warehouse: null,
        loading: true,
        error: null,
        deleting: false,
    });

    const { warehouse, loading, error, deleting } = states ?? {};

    useEffect(() => {
        if (hasClient && id) {
            loadWarehouse();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadWarehouse = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbWarehouses.get(id);
            set("warehouse", data);
        } catch (err) {
            console.error("dbWarehouses.get error", err);
            if (err.response?.status === 404) {
                set("error", "Entrepot introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => {
        navigate("/warehouses");
    };

    const handleEdit = () => {
        navigate(`/warehouses/${id}/edit`);
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cet entrepot",
            message: "Cette action est definitive. Les mouvements de stock historiques sont conserves.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("deleting", true);
        try {
            await dbWarehouses.remove(id);
            navigate("/warehouses", { replace: true });
        } catch (err) {
            console.error("dbWarehouses.remove error", err);
            set("error", "Echec de la suppression");
        } finally {
            set("deleting", false);
        }
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {loading ? "Chargement..." : warehouse?.label || warehouse?.ref || "Entrepot"}
                        </h1>
                        {warehouse?.lieu && (
                            <p className="text-sm text-white/80 md:text-gray-500">{warehouse.lieu}</p>
                        )}
                    </div>
                    {/* Desktop actions in header */}
                    {warehouse && (
                        <div className="hidden md:flex md:items-center md:gap-2">
                            <Button
                                onClick={handleDelete}
                                loading={deleting}
                                icon={FaTrash}
                                buttonProps={{ className: "px-4 py-2 bg-red-100 text-red-600 rounded-lg flex items-center gap-2 font-medium text-sm" }}
                            >
                                Supprimer
                            </Button>
                            <Button
                                onClick={handleEdit}
                                icon={FaPen}
                                buttonProps={{ className: "px-4 py-2 bg-primary text-white rounded-lg flex items-center gap-2 font-medium text-sm" }}
                            >
                                Modifier
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : error ? (
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
            ) : warehouse ? (
                <div className="p-4 md:px-6 md:max-w-5xl md:mx-auto flex flex-col gap-4">
                    <div className="md:grid md:grid-cols-2 md:gap-4 flex flex-col gap-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                                <FaWarehouse className="text-primary" />
                                <span>{warehouse.label || warehouse.ref}</span>
                                {Number(warehouse.statut) !== 1 && (
                                    <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Ferme</span>
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
                            onClick={() => navigate(`/stock?warehouse=${warehouse.id}`)}
                            className="bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-primary"
                        >
                            <div className="text-sm font-medium text-primary">Voir l'inventaire de cet entrepot</div>
                        </button>
                    </div>

                    {/* Mobile actions */}
                    <div className="flex gap-3 pt-2 md:hidden">
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

export default WarehousePage;
