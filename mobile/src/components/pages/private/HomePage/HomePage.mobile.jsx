import { useNavigate } from "react-router-dom";
import {
    FaFileLines, FaCartShopping, FaFileInvoice,
    FaTruck, FaFileInvoiceDollar,
    FaPlus, FaArrowRight,
    FaTriangleExclamation,
    FaUsers,
} from "react-icons/fa6";

import { Page } from "@cap-rel/smartcommon";

import { fmt, fmtDate } from "./useHomeData";

const QUICK_ACTIONS = [
    { to: "/proposals/new",        label: "Nouveau devis",         icon: FaFileLines,         color: "bg-primary" },
    { to: "/invoices/new",         label: "Nouvelle facture",      icon: FaFileInvoice,       color: "bg-secondary" },
    { to: "/orders/new",           label: "Nouvelle commande",     icon: FaCartShopping,      color: "bg-tertiary" },
    { to: "/supplier-orders/new",  label: "Cde fournisseur",       icon: FaTruck,             color: "bg-primary" },
    { to: "/thirdparties/new",     label: "Nouveau tiers",         icon: FaUsers,             color: "bg-tertiary" },
];

export const HomePageMobile = (props) => {
    const {
        user,
        loading,
        unpaidInvoices, unpaidTotal,
        openProposals, openProposalsTotal,
        pendingOrders, pendingOrdersTotal,
        unpaidSupplier, unpaidSupplierTotal,
        overdueInvoices, overdueTotal,
        recentItems,
        now,
        INVOICE_STATUS,
    } = props;

    const navigate = useNavigate();

    return (
        <Page contentProps={{ className: "bg-medium-bg min-h-screen" }}>
            {/* Coloured header */}
            <div className="bg-linear-to-br from-primary to-tertiary px-app-base pt-app-lg pb-app-lg text-white">
                <div className="text-app-xl font-bold tracking-tight">Dolipocket</div>
                <div className="text-app-sm opacity-80 mt-0.5">
                    {user?.username ? `Bonjour, ${user.username}` : "Dolibarr dans la poche"}
                </div>
            </div>

            {/* KPI cards (2 columns, overlap on header) */}
            <div className="px-app-sm -mt-5">
                <div className="grid grid-cols-2 gap-app-xs">
                    <KpiCard
                        icon={FaFileInvoice}
                        label="Factures impayées"
                        value={loading ? "--" : fmt(unpaidTotal)}
                        sub={loading ? "" : `${unpaidInvoices.length} facture${unpaidInvoices.length > 1 ? "s" : ""}`}
                        onClick={() => navigate("/invoices")}
                    />
                    <KpiCard
                        icon={FaFileLines}
                        label="Devis en cours"
                        value={loading ? "--" : fmt(openProposalsTotal)}
                        sub={loading ? "" : `${openProposals.length} devis`}
                        onClick={() => navigate("/proposals")}
                    />
                    <KpiCard
                        icon={FaCartShopping}
                        label="Commandes à traiter"
                        value={loading ? "--" : pendingOrders.length}
                        sub={loading ? "" : `${fmt(pendingOrdersTotal)} EUR`}
                        valueClass="text-primary"
                        onClick={() => navigate("/orders")}
                    />
                    <KpiCard
                        icon={FaFileInvoiceDollar}
                        label="Factures fournisseur"
                        value={loading ? "--" : fmt(unpaidSupplierTotal)}
                        sub={loading ? "" : `${unpaidSupplier.length} impayée${unpaidSupplier.length > 1 ? "s" : ""}`}
                        onClick={() => navigate("/supplier-invoices")}
                    />
                </div>
            </div>

            {/* Overdue alert */}
            {!loading && overdueInvoices.length > 0 && (
                <div className="px-app-sm mt-app-sm">
                    <button
                        type="button"
                        onClick={() => navigate("/invoices")}
                        className="w-full bg-red-50 border border-red-200 rounded-xl p-app-sm flex items-start gap-app-xs active:brightness-95 text-left transition-all"
                    >
                        <FaTriangleExclamation className="text-red-500 text-base mt-0.5 shrink-0" />
                        <div>
                            <div className="text-app-sm font-app-semibold text-red-700">
                                {overdueInvoices.length} facture{overdueInvoices.length > 1 ? "s" : ""} en retard
                            </div>
                            <div className="text-[11px] text-red-600">
                                {fmt(overdueTotal)} EUR TTC à recouvrer
                            </div>
                        </div>
                    </button>
                </div>
            )}

            {/* Quick actions (horizontal scroll) */}
            <div className="px-app-sm mt-app-base">
                <div className="text-[11px] uppercase font-app-bold tracking-widest text-soft-text mb-app-xs px-1">
                    Actions rapides
                </div>
                <div className="flex gap-app-xs overflow-x-auto">
                    {QUICK_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={action.to}
                                type="button"
                                onClick={() => navigate(action.to)}
                                className={`${action.color} text-white rounded-xl px-app-sm py-app-xs flex items-center gap-app-xxs shrink-0 active:brightness-90 transition-all shadow-sm`}
                            >
                                <FaPlus className="text-[10px]" />
                                <Icon className="text-sm" />
                                <span className="text-[11px] font-medium whitespace-nowrap">{action.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Recent activity (card list) */}
            <div className="px-app-sm mt-app-base pb-app-base">
                <div className="text-[11px] uppercase font-app-bold tracking-widest text-soft-text mb-app-xs px-1">
                    Activité récente
                </div>

                {loading && (
                    <div className="bg-soft-bg rounded-xl p-app-base text-center text-soft-text text-app-sm">
                        Chargement...
                    </div>
                )}

                {!loading && recentItems.length === 0 && (
                    <div className="bg-soft-bg rounded-xl p-app-base text-center text-soft-text text-app-sm">
                        Aucune activité récente
                    </div>
                )}

                {!loading && recentItems.length > 0 && (
                    <div className="bg-soft-bg rounded-xl overflow-hidden shadow-sm">
                        {recentItems.map((item, idx) => {
                            const Icon = item.icon;
                            const isOverdue = item.type === "invoice"
                                && Number(item.statut) === INVOICE_STATUS.VALIDATED
                                && Number(item.paye) === 0
                                && Number(item.dateLimReglement) > 0
                                && Number(item.dateLimReglement) < now;
                            return (
                                <button
                                    key={`${item.type}-${item.id}`}
                                    type="button"
                                    onClick={() => navigate(item.to)}
                                    className={`w-full flex items-center gap-app-sm px-app-sm py-2.5 active:bg-medium-bg transition-colors text-left ${
                                        idx < recentItems.length - 1 ? "border-b border-soft-border" : ""
                                    }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        item.type === "invoice" ? "bg-secondary/10 text-secondary"
                                        : item.type === "proposal" ? "bg-primary/10 text-primary"
                                        : "bg-tertiary/10 text-tertiary"
                                    }`}>
                                        <Icon className="text-sm" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                            <span className="text-app-sm font-app-semibold text-strong-text truncate">
                                                {item.ref || `#${item.id}`}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                                isOverdue ? "bg-red-100 text-red-700"
                                                : item.type === "invoice" && Number(item.paye) === 1 ? "bg-green-100 text-green-700"
                                                : "bg-gray-100 text-gray-600"
                                            }`}>
                                                {isOverdue ? "En retard" : item.label}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-soft-text">
                                            {fmtDate(item.date)}
                                        </div>
                                    </div>
                                    <div className="text-app-sm font-app-semibold text-strong-text shrink-0">
                                        {fmt(item.amount)}
                                    </div>
                                    <FaArrowRight className="text-[10px] text-soft-text shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </Page>
    );
};

const KpiCard = ({ icon: Icon, label, value, sub, valueClass = "text-strong-text", onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="bg-soft-bg rounded-xl p-app-sm shadow-sm text-left active:brightness-95 transition-all"
    >
        <div className="flex items-center gap-app-xxs text-soft-text mb-1">
            <Icon className="text-xs" />
            <span className="text-[11px] font-medium">{label}</span>
        </div>
        <div className={`text-app-lg font-bold ${valueClass}`}>{value}</div>
        <div className="text-[11px] text-soft-text mt-0.5">{sub}</div>
    </button>
);
