import { useNavigate, useLocation } from "react-router-dom";
import {
    FaHouse,
    FaChartLine,
    FaBasketShopping,
    FaUsers,
    FaBars,
} from "react-icons/fa6";

import { useMenu } from "src/lib/permissions";

// Hardcoded list of bottom-nav tabs. The bottom nav is space-constrained
// (5 slots max) so we don't render it from the server menu - we just
// filter out tabs the user has no read permission for. The "more" tab
// is always shown so users still reach the slide-up MoreMenu, and the
// "home" tab is always shown so the dashboard stays reachable.
const TABS = [
    { key: "home",     path: "/",                icon: FaHouse,           label: "Accueil",  permission: null },
    { key: "vente",    path: "/proposals",       icon: FaChartLine,       label: "Vente",    permission: "proposal.read" },
    { key: "achat",    path: "/supplier-orders", icon: FaBasketShopping,  label: "Achat",    permission: "supplierorder.read" },
    { key: "contacts", path: "/thirdparties",    icon: FaUsers,           label: "Contacts", permission: "thirdparty.read" },
    { key: "more",     path: null,               icon: FaBars,            label: "Plus",     permission: null },
];

// Prefix matching: which routes belong to which tab
const TAB_PREFIXES = {
    home:     ["/"],
    vente:    ["/proposals", "/orders", "/invoices"],
    achat:    ["/supplier-orders", "/supplier-invoices"],
    contacts: ["/thirdparties", "/contacts"],
};

const getActiveTab = (pathname) => {
    for (const [tab, prefixes] of Object.entries(TAB_PREFIXES)) {
        for (const prefix of prefixes) {
            if (prefix === "/" && pathname === "/") return tab;
            if (prefix !== "/" && pathname.startsWith(prefix)) return tab;
        }
    }
    return null;
};

export const BottomNav = ({ onMorePress }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { has } = useMenu();
    const activeTab = getActiveTab(location.pathname);

    // Filter tabs: keep those without a permission requirement (home, more)
    // and those granted to the user. has() is permissive (returns true)
    // when the permissions payload is missing, so this stays a no-op
    // until the backend ships the new contract.
    const visibleTabs = TABS.filter((tab) => has(tab.permission));

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-soft-bg border-t border-soft-border safe-area-bottom">
            <div className="flex items-stretch justify-around h-14">
                {visibleTabs.map((tab) => {
                    const isActive = tab.key === activeTab;
                    const Icon = tab.icon;
                    const handleClick = () => {
                        if (tab.key === "more") {
                            onMorePress?.();
                        } else {
                            navigate(tab.path);
                        }
                    };
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={handleClick}
                            className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 ${
                                isActive
                                    ? "text-primary"
                                    : "text-soft-text active:text-primary"
                            }`}
                        >
                            <Icon className={`text-lg ${isActive ? "text-primary" : ""}`} />
                            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
                            {isActive && (
                                <div className="absolute bottom-0 w-10 h-0.5 rounded-full bg-primary" />
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
};
