import { useNavigate } from "react-router-dom";
import {
    FaFileLines, FaCartShopping, FaFileInvoice,
    FaTruck, FaFileInvoiceDollar,
    FaPlus, FaArrowRight, FaTriangleExclamation,
    FaUsers, FaIdCard, FaBoxOpen,
} from "react-icons/fa6";

import { useMenu } from "src/lib/permissions";

import { fmt, fmtDate } from "./useHomeData";

// Tablet dashboard (landscape, touch-first). Reuses useHomeData() verbatim;
// only the layout differs from desktop: large KPI tiles in a 2-column grid,
// big quick-action tiles (filtered by permissions, unlike the desktop rail),
// and a touch-sized recent-activity list. No hover-only affordances.

// Quick "create" tiles, each gated by the matching create permission.
const QUICK_ACTIONS = [
    { to: "/proposals/new",       label: "Nouveau devis",     icon: FaFileLines,    accent: "primary",   permission: "proposal.create" },
    { to: "/invoices/new",        label: "Nouvelle facture",  icon: FaFileInvoice,  accent: "secondary", permission: "invoice.create" },
    { to: "/orders/new",          label: "Nouvelle commande", icon: FaCartShopping, accent: "tertiary",  permission: "order.create" },
    { to: "/supplier-orders/new", label: "Cde fournisseur",   icon: FaTruck,        accent: "primary",   permission: "supplierorder.create" },
    { to: "/thirdparties/new",    label: "Nouveau tiers",     icon: FaUsers,        accent: "tertiary",  permission: "thirdparty.create" },
];

const BROWSE_SHORTCUTS = [
    { to: "/contacts", label: "Contacts", icon: FaIdCard,  permission: "contact.read" },
    { to: "/products", label: "Produits", icon: FaBoxOpen, permission: "product.read" },
];

const accentClass = (accent) =>
    accent === "secondary" ? "bg-secondary/10 text-secondary"
        : accent === "tertiary" ? "bg-tertiary/10 text-tertiary"
            : "bg-primary/10 text-primary";

const KpiTile = ({ icon: Icon, label, value, unit, sub, accent = "primary", onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="bg-white rounded-xl p-5 border border-soft-border text-left active:bg-medium-bg/40 transition-colors"
    >
        <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-soft-text uppercase tracking-wider">{label}</span>
            <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentClass(accent)}`}>
                <Icon className="text-base" />
            </span>
        </div>
        <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-strong-text leading-none">{value}</span>
            {unit && <span className="text-sm text-soft-text font-medium">{unit}</span>}
        </div>
        <div className="text-sm text-soft-text mt-2 truncate">{sub}</div>
    </button>
);

export const HomePageTablet = (props) => {
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
    const { has } = useMenu();

    const quickActions = QUICK_ACTIONS.filter((a) => has(a.permission));
    const shortcuts = BROWSE_SHORTCUTS.filter((s) => has(s.permission));

    return (
        <div className="w-full min-h-full bg-medium-bg">
            {/* Greeting */}
            <div className="bg-white border-b border-soft-border px-6 py-5">
                <h1 className="text-2xl font-bold text-strong-text leading-tight">
                    {user?.username ? `Bonjour, ${user.username}` : "Tableau de bord"}
                </h1>
                <p className="text-sm text-soft-text mt-0.5">Synthèse de votre activité</p>
            </div>

            <div className="p-6 space-y-6">
                {/* KPI tiles (2 columns) */}
                <div className="grid grid-cols-2 gap-4">
                    <KpiTile
                        icon={FaFileInvoice}
                        label="Factures impayées"
                        value={loading ? "--" : fmt(unpaidTotal)}
                        unit="EUR"
                        sub={loading ? "" : `${unpaidInvoices.length} facture${unpaidInvoices.length > 1 ? "s" : ""}`}
                        accent="secondary"
                        onClick={() => navigate("/invoices")}
                    />
                    <KpiTile
                        icon={FaFileLines}
                        label="Devis en cours"
                        value={loading ? "--" : fmt(openProposalsTotal)}
                        unit="EUR"
                        sub={loading ? "" : `${openProposals.length} devis`}
                        accent="primary"
                        onClick={() => navigate("/proposals")}
                    />
                    <KpiTile
                        icon={FaCartShopping}
                        label="Commandes à traiter"
                        value={loading ? "--" : pendingOrders.length}
                        sub={loading ? "" : `${fmt(pendingOrdersTotal)} EUR`}
                        accent="tertiary"
                        onClick={() => navigate("/orders")}
                    />
                    <KpiTile
                        icon={FaFileInvoiceDollar}
                        label="Factures fournisseur"
                        value={loading ? "--" : fmt(unpaidSupplierTotal)}
                        unit="EUR"
                        sub={loading ? "" : `${unpaidSupplier.length} impayée${unpaidSupplier.length > 1 ? "s" : ""}`}
                        accent="primary"
                        onClick={() => navigate("/supplier-invoices")}
                    />
                </div>

                {/* Overdue alert */}
                {!loading && overdueInvoices.length > 0 && (
                    <button
                        type="button"
                        onClick={() => navigate("/invoices")}
                        className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-left active:bg-red-100/50 transition-colors"
                    >
                        <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                            <FaTriangleExclamation className="text-red-500 text-lg" />
                        </div>
                        <div className="grow">
                            <div className="text-base font-semibold text-red-700">
                                {overdueInvoices.length} facture{overdueInvoices.length > 1 ? "s" : ""} en retard
                            </div>
                            <div className="text-sm text-red-600">{fmt(overdueTotal)} EUR TTC à recouvrer</div>
                        </div>
                        <FaArrowRight className="text-red-500 shrink-0" />
                    </button>
                )}

                {/* Quick actions (large touch tiles) */}
                {quickActions.length > 0 && (
                    <section>
                        <h2 className="text-sm font-semibold text-strong-text mb-3">Actions rapides</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {quickActions.map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.to}
                                        type="button"
                                        onClick={() => navigate(action.to)}
                                        className="flex items-center gap-3 px-4 min-h-16 rounded-xl bg-white border border-soft-border text-left active:bg-medium-bg/40 transition-colors"
                                    >
                                        <span className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${accentClass(action.accent)}`}>
                                            <Icon className="text-base" />
                                        </span>
                                        <span className="grow font-semibold text-strong-text">{action.label}</span>
                                        <FaPlus className="text-xs text-soft-text shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Browse shortcuts */}
                {shortcuts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {shortcuts.map((s) => {
                            const Icon = s.icon;
                            return (
                                <button
                                    key={s.to}
                                    type="button"
                                    onClick={() => navigate(s.to)}
                                    className="flex items-center gap-2 h-11 px-4 rounded-lg bg-white border border-soft-border text-sm font-medium text-strong-text active:bg-medium-bg/60 transition-colors"
                                >
                                    <Icon className="text-sm text-soft-text" />
                                    <span>{s.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Recent activity (touch list) */}
                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                    <header className="flex items-center justify-between px-4 py-3 border-b border-soft-border">
                        <div className="text-sm font-semibold text-strong-text">Activité récente</div>
                        {!loading && recentItems.length > 0 && (
                            <div className="text-xs text-soft-text">{totalDocuments} documents au total</div>
                        )}
                    </header>

                    {loading && (
                        <div className="px-4 py-10 text-center text-soft-text text-sm">Chargement...</div>
                    )}
                    {!loading && recentItems.length === 0 && (
                        <div className="px-4 py-10 text-center text-soft-text text-sm">Aucune activité récente</div>
                    )}
                    {!loading && recentItems.length > 0 && (
                        <ul>
                            {recentItems.map((item) => {
                                const Icon = item.icon;
                                const isOverdue = item.type === "invoice"
                                    && Number(item.statut) === INVOICE_STATUS.VALIDATED
                                    && Number(item.paye) === 0
                                    && Number(item.dateLimReglement) > 0
                                    && Number(item.dateLimReglement) < now;
                                return (
                                    <li key={`${item.type}-${item.id}`}>
                                        <button
                                            type="button"
                                            onClick={() => navigate(item.to)}
                                            className="w-full flex items-center gap-3 px-4 min-h-14 py-2 border-b border-soft-border/60 text-left active:bg-medium-bg/50 transition-colors"
                                        >
                                            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                                item.type === "invoice" ? "bg-secondary/10 text-secondary"
                                                : item.type === "proposal" ? "bg-primary/10 text-primary"
                                                : "bg-tertiary/10 text-tertiary"
                                            }`}>
                                                <Icon className="text-sm" />
                                            </span>
                                            <div className="min-w-0 grow">
                                                <div className="text-sm font-semibold text-strong-text truncate">
                                                    {item.ref || `#${item.id}`}
                                                </div>
                                                <div className="text-xs text-soft-text">{fmtDate(item.date)}</div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                <span className="text-sm font-semibold text-strong-text">{fmt(item.amount)}</span>
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                                    isOverdue ? "bg-red-100 text-red-700"
                                                    : item.type === "invoice" && Number(item.paye) === 1 ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-gray-100 text-gray-600"
                                                }`}>
                                                    {isOverdue ? "En retard" : item.label}
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};
