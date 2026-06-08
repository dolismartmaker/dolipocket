import { useNavigate } from "react-router-dom";
import {
    FaFileLines, FaCartShopping, FaFileInvoice,
    FaTruck, FaFileInvoiceDollar,
    FaPlus, FaArrowRight,
    FaTriangleExclamation,
    FaUsers, FaIdCard, FaBoxOpen,
} from "react-icons/fa6";

import { fmt, fmtDate } from "./useHomeData";

// Quick "create" buttons. Kept compact (icon + label) and grouped in the
// right rail so the main content area can breathe.
const QUICK_ACTIONS = [
    { to: "/proposals/new",       label: "Nouveau devis",      icon: FaFileLines,    accent: "primary"   },
    { to: "/invoices/new",        label: "Nouvelle facture",   icon: FaFileInvoice,  accent: "secondary" },
    { to: "/orders/new",          label: "Nouvelle commande",  icon: FaCartShopping, accent: "tertiary"  },
    { to: "/supplier-orders/new", label: "Cde fournisseur",    icon: FaTruck,        accent: "primary"   },
    { to: "/thirdparties/new",    label: "Nouveau tiers",      icon: FaUsers,        accent: "tertiary"  },
];

// Browse shortcuts (read-only navigation, no creation). Renders as a small
// chip cluster under the quick-create stack.
const BROWSE_SHORTCUTS = [
    { to: "/contacts",     label: "Contacts",  icon: FaIdCard },
    { to: "/products",     label: "Produits",  icon: FaBoxOpen },
];

export const HomePageDesktop = (props) => {
    const {
        user,
        loading,
        unpaidInvoices, unpaidTotal,
        openProposals, openProposalsTotal,
        pendingOrders, pendingOrdersTotal,
        unpaidSupplier, unpaidSupplierTotal,
        overdueInvoices, overdueTotal,
        recentItems,
        totalDocuments,
        now,
        INVOICE_STATUS,
    } = props;

    const navigate = useNavigate();

    return (
        <div className="w-full min-h-full bg-medium-bg overflow-y-auto">
            {/* Greeting bar (white) */}
            <div className="bg-white border-b border-soft-border px-8 py-5">
                <h1 className="text-2xl font-bold text-strong-text leading-tight">
                    {user?.username ? `Bonjour, ${user.username}` : "Tableau de bord"}
                </h1>
                <p className="text-sm text-soft-text mt-0.5">
                    Vue d'ensemble de votre activité
                </p>
            </div>

            {/* KPI band (4 equal cards, full width, no wrap) */}
            <div className="px-8 pt-6">
                <div className="grid grid-cols-4 gap-4">
                    <KpiCard
                        icon={FaFileInvoice}
                        label="Factures impayées"
                        value={loading ? "--" : `${fmt(unpaidTotal)}`}
                        unit="EUR"
                        sub={loading ? "" : `${unpaidInvoices.length} facture${unpaidInvoices.length > 1 ? "s" : ""}`}
                        accent="secondary"
                        onClick={() => navigate("/invoices")}
                    />
                    <KpiCard
                        icon={FaFileLines}
                        label="Devis en cours"
                        value={loading ? "--" : `${fmt(openProposalsTotal)}`}
                        unit="EUR"
                        sub={loading ? "" : `${openProposals.length} devis`}
                        accent="primary"
                        onClick={() => navigate("/proposals")}
                    />
                    <KpiCard
                        icon={FaCartShopping}
                        label="Commandes à traiter"
                        value={loading ? "--" : pendingOrders.length}
                        unit={pendingOrders.length > 0 ? "" : null}
                        sub={loading ? "" : `${fmt(pendingOrdersTotal)} EUR`}
                        accent="tertiary"
                        onClick={() => navigate("/orders")}
                    />
                    <KpiCard
                        icon={FaFileInvoiceDollar}
                        label="Factures fournisseur"
                        value={loading ? "--" : `${fmt(unpaidSupplierTotal)}`}
                        unit="EUR"
                        sub={loading ? "" : `${unpaidSupplier.length} impayée${unpaidSupplier.length > 1 ? "s" : ""}`}
                        accent="primary"
                        onClick={() => navigate("/supplier-invoices")}
                    />
                </div>
            </div>

            {/* Overdue alert (full-width banner) */}
            {!loading && overdueInvoices.length > 0 && (
                <div className="px-8 pt-4">
                    <button
                        type="button"
                        onClick={() => navigate("/invoices")}
                        className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 hover:border-red-300 hover:bg-red-100/50 text-left transition-colors"
                    >
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <FaTriangleExclamation className="text-red-500 text-lg" />
                        </div>
                        <div className="grow">
                            <div className="text-base font-semibold text-red-700">
                                {overdueInvoices.length} facture{overdueInvoices.length > 1 ? "s" : ""} en retard
                            </div>
                            <div className="text-sm text-red-600">
                                {fmt(overdueTotal)} EUR TTC à recouvrer
                            </div>
                        </div>
                        <FaArrowRight className="text-red-500 shrink-0" />
                    </button>
                </div>
            )}

            {/* Main two-column grid: activity (2/3) + actions rail (1/3) */}
            <div className="px-8 py-6 grid grid-cols-3 gap-6 items-start">
                {/* LEFT : Activity (col-span-2) */}
                <section className="col-span-2 bg-white rounded-xl border border-soft-border overflow-hidden">
                    <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                        <div className="text-sm font-semibold text-strong-text">
                            Activité récente
                        </div>
                        {!loading && recentItems.length > 0 && (
                            <div className="text-xs text-soft-text">
                                {totalDocuments} documents au total
                            </div>
                        )}
                    </header>

                    {loading && (
                        <div className="px-4 py-10 text-center text-soft-text text-sm">
                            Chargement...
                        </div>
                    )}

                    {!loading && recentItems.length === 0 && (
                        <div className="px-4 py-10 text-center text-soft-text text-sm">
                            Aucune activité récente
                        </div>
                    )}

                    {!loading && recentItems.length > 0 && (
                        <div>
                            <div className="grid grid-cols-[2.5rem_1fr_6rem_5.5rem_7rem_1.25rem] items-center gap-3 px-4 py-2 bg-medium-bg/40 border-b border-soft-border text-[11px] font-semibold text-soft-text uppercase tracking-wider">
                                <div />
                                <div>Référence</div>
                                <div className="text-center">Statut</div>
                                <div className="text-right">Date</div>
                                <div className="text-right">Montant</div>
                                <div />
                            </div>
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
                                        className={`w-full grid grid-cols-[2.5rem_1fr_6rem_5.5rem_7rem_1.25rem] items-center gap-3 px-4 py-2 hover:bg-medium-bg/50 transition-colors text-left ${
                                            idx < recentItems.length - 1 ? "border-b border-soft-border/60" : ""
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                            item.type === "invoice" ? "bg-secondary/10 text-secondary"
                                            : item.type === "proposal" ? "bg-primary/10 text-primary"
                                            : "bg-tertiary/10 text-tertiary"
                                        }`}>
                                            <Icon className="text-xs" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-strong-text truncate">
                                                {item.ref || `#${item.id}`}
                                            </div>
                                        </div>
                                        <div className="flex justify-center">
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                                isOverdue ? "bg-red-100 text-red-700"
                                                : item.type === "invoice" && Number(item.paye) === 1 ? "bg-emerald-100 text-emerald-700"
                                                : "bg-gray-100 text-gray-600"
                                            }`}>
                                                {isOverdue ? "En retard" : item.label}
                                            </span>
                                        </div>
                                        <div className="text-right text-xs text-soft-text">
                                            {fmtDate(item.date)}
                                        </div>
                                        <div className="text-right text-sm font-semibold text-strong-text">
                                            {fmt(item.amount)}
                                        </div>
                                        <FaArrowRight className="text-[10px] text-soft-text" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* RIGHT : Action rail (col-span-1) */}
                <aside className="col-span-1 flex flex-col gap-4">
                    <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <div className="text-sm font-semibold text-strong-text">
                                Actions rapides
                            </div>
                        </header>
                        <div className="flex flex-col p-2">
                            {QUICK_ACTIONS.map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.to}
                                        type="button"
                                        onClick={() => navigate(action.to)}
                                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm text-strong-text hover:bg-medium-bg/60 transition-colors"
                                    >
                                        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                            action.accent === "primary"   ? "bg-primary/10 text-primary"
                                            : action.accent === "secondary" ? "bg-secondary/10 text-secondary"
                                            : "bg-tertiary/10 text-tertiary"
                                        }`}>
                                            <Icon className="text-xs" />
                                        </span>
                                        <span className="grow font-medium">{action.label}</span>
                                        <FaPlus className="text-[10px] text-soft-text" />
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <div className="text-sm font-semibold text-strong-text">
                                Raccourcis
                            </div>
                        </header>
                        <div className="flex flex-wrap gap-2 p-3">
                            {BROWSE_SHORTCUTS.map((s) => {
                                const Icon = s.icon;
                                return (
                                    <button
                                        key={s.to}
                                        type="button"
                                        onClick={() => navigate(s.to)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-medium-bg/60 hover:bg-medium-bg text-sm text-strong-text transition-colors"
                                    >
                                        <Icon className="text-xs text-soft-text" />
                                        <span>{s.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
};

const KpiCard = ({ icon: Icon, label, value, unit, sub, accent = "primary", onClick }) => {
    const accentBg = accent === "secondary" ? "bg-secondary/10 text-secondary"
        : accent === "tertiary" ? "bg-tertiary/10 text-tertiary"
        : "bg-primary/10 text-primary";
    return (
        <button
            type="button"
            onClick={onClick}
            className="bg-white rounded-xl p-4 border border-soft-border text-left hover:border-soft-border/80 transition-colors"
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-soft-text uppercase tracking-wider">
                    {label}
                </span>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentBg}`}>
                    <Icon className="text-xs" />
                </span>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-strong-text leading-none">{value}</span>
                {unit && <span className="text-xs text-soft-text font-medium">{unit}</span>}
            </div>
            <div className="text-xs text-soft-text mt-1.5 truncate">{sub}</div>
        </button>
    );
};
