import { FaPlus, FaArrowLeft } from "react-icons/fa";

import { Page, Block, Select, Button } from "@cap-rel/smartcommon";
import { labelsWithFallback } from "src/utils";

// Status labels for CommandeFournisseur (Dolibarr STATUS_* constants).
// 0 Draft, 1 Validated, 2 Approved, 3 Order sent, 4 Received partially,
// 5 Received completely, 6 Canceled, 7 Canceled after order, 9 Refused.
const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Approuvée",
    3: "Commande envoyée",
    4: "Reçue partiellement",
    5: "Reçue totalement",
    6: "Annulée",
    7: "Annulée après commande",
    9: "Refusée",
};

const STATUS_OPTIONS = [
    { value: "", label: "Tous statuts" },
    { value: "0", label: "Brouillon" },
    { value: "1", label: "Validée" },
    { value: "2", label: "Approuvée" },
    { value: "3", label: "Commande envoyée" },
    { value: "4", label: "Reçue partiellement" },
    { value: "5", label: "Reçue totalement" },
];

const formatDate = (value) => {
    if (!value) return "";
    const ts = typeof value === "number" ? value * 1000 : Date.parse(value);
    if (Number.isNaN(ts)) return "";
    return new Date(ts).toLocaleDateString("fr-FR");
};

const formatAmount = (value) => {
    const n = Number(value ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
};

// Mobile rendering of the supplier orders list. Presentational only.
export const SupplierOrdersPageMobile = (props) => {
    const {
        navigate,
        orders, loading, error, statusFilter, searchQuery,
        set, loadOrders,
    } = props;

    const handleSearch = (e) => {
        e.preventDefault();
        loadOrders();
    };

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={() => navigate("/")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Commandes fournisseur</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{orders.length} commande{orders.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                        onClick={() => navigate("/supplier-orders/new")}
                        className="p-2 bg-white/20 rounded-lg active:bg-white/30"
                        aria-label="Nouvelle commande"
                    >
                        <FaPlus />
                    </button>
                </div>
            </div>

            <div className="p-4 md:px-6 flex flex-col gap-4 md:max-w-5xl md:mx-auto">
                <Block blockProps={{ className: "rounded-xl" }}>
                    <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row md:items-end">
                        <Select
                            labels={labelsWithFallback("Select")}
                            label="Statut"
                            value={statusFilter}
                            options={STATUS_OPTIONS}
                            onChange={(value) => set("statusFilter", value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => set("searchQuery", e.target.value)}
                                placeholder="Rechercher (ref, ref fournisseur)"
                                className="flex-1 bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                            <Button buttonProps={{ type: "submit", className: "px-4 bg-primary text-white rounded-lg" }}>
                                OK
                            </Button>
                        </div>
                    </form>
                </Block>

                {loading && <div className="text-center py-6 text-gray-500">Chargement...</div>}

                {error && (
                    <div className="bg-red-100 text-red-700 p-3 rounded-lg">
                        {error}
                        <button onClick={loadOrders} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {!loading && !error && orders.length === 0 && (
                    <div className="bg-white rounded-xl p-6 text-center text-gray-500">
                        Aucune commande fournisseur.
                    </div>
                )}

                <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                    {orders.map((o) => (
                        <button
                            key={o.id}
                            onClick={() => navigate(`/supplier-orders/${o.id}`)}
                            className="bg-white rounded-xl p-4 text-left active:brightness-95 shadow-sm border border-gray-100"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-gray-800">{o.ref || "(sans réf)"}</div>
                                    {o.refSupplier && (
                                        <div className="text-xs text-gray-500">Réf fourn. : {o.refSupplier}</div>
                                    )}
                                    <div className="text-xs text-gray-500 mt-1">
                                        {formatDate(o.dateCommande)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="inline-block text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                        {STATUS_LABELS[o.statut] ?? `Statut ${o.statut}`}
                                    </span>
                                    <div className="text-sm font-medium text-gray-800 mt-1">
                                        {formatAmount(o.totalTtc)}
                                    </div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </Page>
    );
};
