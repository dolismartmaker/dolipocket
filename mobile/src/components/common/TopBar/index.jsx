import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { FaCircleInfo, FaChevronDown } from "react-icons/fa6";

import { useApi, useStates } from "@cap-rel/smartcommon";
import { AboutModal } from "src/components/common/AboutModal";
import { ViewportSwitcher } from "src/components/common/ViewportSwitcher";

// Map route prefixes to breadcrumb labels
const BREADCRUMBS = {
    "/":                   "Tableau de bord",
    "/thirdparties":       "Tiers",
    "/contacts":           "Contacts",
    "/products":           "Produits",
    "/warehouses":         "Entrepôts",
    "/stock":              "Stock",
    "/proposals":          "Devis",
    "/orders":             "Commandes",
    "/invoices":           "Factures",
    "/supplier-orders":    "Commandes fournisseur",
    "/supplier-invoices":  "Factures fournisseur",
    "/agenda":             "Agenda",
    "/documents":          "Documents",
};

const getSuffix = (pathname) => {
    if (pathname.endsWith("/new")) return "Nouveau";
    if (pathname.endsWith("/edit")) return "Modifier";
    // Detail page: /entity/123
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) return `#${parts[parts.length - 1]}`;
    return null;
};

const getBreadcrumb = (pathname) => {
    // Exact match first
    if (BREADCRUMBS[pathname]) return [BREADCRUMBS[pathname]];

    // Find prefix match
    const sorted = Object.keys(BREADCRUMBS)
        .filter((k) => k !== "/" && pathname.startsWith(k))
        .sort((a, b) => b.length - a.length);

    if (sorted.length > 0) {
        const prefix = sorted[0];
        const crumbs = [BREADCRUMBS[prefix]];
        const suffix = getSuffix(pathname);
        if (suffix) crumbs.push(suffix);
        return crumbs;
    }

    return ["Dolipocket"];
};

export const TopBar = () => {
    const location = useLocation();
    const { user } = useApi();
    const crumbs = getBreadcrumb(location.pathname);

    const { states, set } = useStates({
        isAboutOpen: false,
        isUserMenuOpen: false,
    });
    const { isAboutOpen, isUserMenuOpen } = states ?? {};

    const menuRef = useRef(null);

    // Close on outside click and on Escape. Stays simple: no portal,
    // the menu sits inside the TopBar header so positioning is trivial.
    useEffect(() => {
        if (!isUserMenuOpen) return undefined;

        const onPointerDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                set("isUserMenuOpen", false);
            }
        };
        const onKey = (e) => {
            if (e.key === "Escape") set("isUserMenuOpen", false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isUserMenuOpen]);

    return (
        <>
            <AboutModal
                open={isAboutOpen}
                onClose={() => set("isAboutOpen", false)}
                appName="Dolipocket"
            />
            <header className="hidden md:flex items-center h-14 px-6 border-b border-soft-border bg-soft-bg sticky top-0 z-20">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
                    {crumbs.map((crumb, idx) => (
                        <span key={idx} className="flex items-center gap-1.5">
                            {idx > 0 && <span className="text-soft-text">/</span>}
                            <span className={idx === crumbs.length - 1 ? "font-semibold text-strong-text" : "text-soft-text"}>
                                {crumb}
                            </span>
                        </span>
                    ))}
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    {user?.username && (
                        <div className="relative" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => set("isUserMenuOpen", !isUserMenuOpen)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm transition-colors ${
                                    isUserMenuOpen ? "bg-medium-bg text-strong-text" : "text-medium-text hover:bg-medium-bg hover:text-strong-text"
                                }`}
                            >
                                <span className="max-w-[200px] truncate">{user.username}</span>
                                <FaChevronDown className={`text-[10px] transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`} />
                            </button>

                            {isUserMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-64 bg-soft-bg border border-soft-border rounded-lg shadow-lg overflow-hidden">
                                    <div className="px-3 py-2 border-b border-soft-border">
                                        <div className="text-xs uppercase font-bold tracking-widest text-soft-text">
                                            Vue
                                        </div>
                                    </div>
                                    <ViewportSwitcher
                                        density="compact"
                                        onAfterSelect={() => set("isUserMenuOpen", false)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => set("isAboutOpen", true)}
                        className="p-1.5 rounded-lg text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    >
                        <FaCircleInfo className="text-base" />
                    </button>
                </div>
            </header>
        </>
    );
};
