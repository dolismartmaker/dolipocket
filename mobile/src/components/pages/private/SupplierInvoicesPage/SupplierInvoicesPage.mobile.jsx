import { FaPlus, FaArrowLeft } from "react-icons/fa";

import { Page, Block, Select } from "@cap-rel/smartcommon";

// Status labels for FactureFournisseur (Dolibarr STATUS_*).
// 0 Draft, 1 Validated, 2 Closed/Paid, 3 Abandoned.
const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Réglée",
    3: "Abandonnée",
};

const STATUS_OPTIONS = [
    { value: "", label: "Tous statuts" },
    { value: "0", label: "Brouillon" },
    { value: "1", label: "Validée" },
    { value: "2", label: "Réglée" },
    { value: "3", label: "Abandonnée" },
];

const PAYE_OPTIONS = [
    { value: "", label: "Tous paiements" },
    { value: "0", label: "Impayée" },
    { value: "1", label: "Payée" },
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

// Mobile rendering of the supplier invoices list. Presentational only.
export const SupplierInvoicesPageMobile = (props) => {
    const {
        navigate,
        invoices, loading, error, statusFilter, payeFilter,
        set, loadInvoices,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={() => navigate("/")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Factures fournisseur</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">{invoices.length} facture{invoices.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                        onClick={() => navigate("/supplier-invoices/new")}
                        className="p-2 bg-white/20 rounded-lg active:bg-white/30"
                        aria-label="Nouvelle facture"
                    >
                        <FaPlus />
                    </button>
                </div>
            </div>

            <div className="p-4 md:px-6 flex flex-col gap-4 md:max-w-5xl md:mx-auto">
                <Block blockProps={{ className: "rounded-xl" }}>
                    <div className="grid grid-cols-2 gap-3 md:flex md:flex-row md:items-end">
                        <Select
                            label="Statut"
                            value={statusFilter}
                            options={STATUS_OPTIONS}
                            onChange={(value) => set("statusFilter", value)}
                        />
                        <Select
                            label="Paiement"
                            value={payeFilter}
                            options={PAYE_OPTIONS}
                            onChange={(value) => set("payeFilter", value)}
                        />
                    </div>
                </Block>

                {loading && <div className="text-center py-6 text-gray-500">Chargement...</div>}

                {error && (
                    <div className="bg-red-100 text-red-700 p-3 rounded-lg">
                        {error}
                        <button onClick={loadInvoices} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {!loading && !error && invoices.length === 0 && (
                    <div className="bg-white rounded-xl p-6 text-center text-gray-500">
                        Aucune facture fournisseur.
                    </div>
                )}

                <div className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                    {invoices.map((f) => {
                        const isPaid = Number(f.paye) === 1;
                        return (
                            <button
                                key={f.id}
                                onClick={() => navigate(`/supplier-invoices/${f.id}`)}
                                className="bg-white rounded-xl p-4 text-left active:brightness-95 shadow-sm border border-gray-100"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="font-bold text-gray-800">{f.ref || "(sans réf)"}</div>
                                        {f.refSupplier && (
                                            <div className="text-xs text-gray-500">Réf fourn. : {f.refSupplier}</div>
                                        )}
                                        <div className="text-xs text-gray-500 mt-1">{formatDate(f.datef)}</div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`inline-block text-xs px-2 py-1 rounded-full ${isPaid ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                            {isPaid ? "Payée" : "Impayée"}
                                        </span>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {STATUS_LABELS[f.statut] ?? `Statut ${f.statut}`}
                                        </div>
                                        <div className="text-sm font-medium text-gray-800 mt-1">
                                            {formatAmount(f.totalTtc)}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </Page>
    );
};
