import { useNavigate, useLocation } from "react-router-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { LuLogOut } from "react-icons/lu";

import { useApi, useStates } from "@cap-rel/smartcommon";

import { API_ABORT_TIMEOUT } from "src/utils";
import { useMenu, getIconComponent } from "src/lib/permissions";

// Active state computation. A menu item with route "/" only matches the
// exact root path; any other route matches by path prefix so child pages
// (e.g. /thirdparties/42) still highlight the parent entry.
const isActiveRoute = (pathname, route) => {
    if (!route) return false;
    if (route === "/" && pathname === "/") return true;
    if (route !== "/" && pathname.startsWith(route)) return true;
    return false;
};

export const Sidebar = ({ collapsed, onToggle }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, user } = useApi();

    const { menu, loading: menuLoading } = useMenu();

    const { states, set } = useStates({ isLoggingOut: false });
    const { isLoggingOut } = states ?? {};

    const handleLogout = () => {
        set("isLoggingOut", true);
        logout({ signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
            .catch(err => console.error("POST 'logout' error", err))
            .finally(() => set("isLoggingOut", false));
    };

    // Server-driven sections. We never fall back to a hardcoded list:
    // either the menu is loading (skeleton) or it loaded as an empty
    // list (no entries shown but the chrome stays). The skeleton is
    // shown only on the very first load, before anything is cached.
    const sections = Array.isArray(menu) ? menu : [];
    const showSkeleton = menuLoading && sections.length === 0;

    return (
        <aside
            className={`hidden md:flex flex-col bg-soft-bg border-r border-soft-border h-screen sticky top-0 transition-all duration-200 z-30 ${
                collapsed ? "w-16" : "w-56"
            }`}
        >
            {/* Logo / Brand */}
            <div className="flex items-center gap-2 px-3 h-14 border-b border-soft-border shrink-0">
                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary to-tertiary flex items-center justify-center text-white font-bold text-sm shrink-0">
                    D
                </div>
                {!collapsed && (
                    <span className="text-app-base font-bold text-strong-text tracking-tight">Dolipocket</span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-2 px-2">
                {showSkeleton && (
                    !collapsed
                        ? <div className="px-2.5 py-2 text-xs text-soft-text">Chargement...</div>
                        : <div className="px-2.5 py-2 text-xs text-soft-text text-center">...</div>
                )}
                {!showSkeleton && sections.map((section, sIdx) => {
                    const items = Array.isArray(section?.items) ? section.items : [];
                    if (items.length === 0) return null;
                    return (
                        <div key={section.title ?? sIdx} className="mb-1">
                            {!collapsed && section.title && (
                                <div className="uppercase text-[10px] font-app-bold tracking-widest text-soft-text px-2 pt-3 pb-1">
                                    {section.title}
                                </div>
                            )}
                            {collapsed && sIdx > 0 && (
                                <div className="border-t border-soft-border mx-2 my-1" />
                            )}
                            {items.map((item) => {
                                const Icon = getIconComponent(item.icon);
                                const active = isActiveRoute(location.pathname, item.route);
                                return (
                                    <button
                                        key={item.id ?? item.route}
                                        type="button"
                                        onClick={() => item.route && navigate(item.route)}
                                        title={collapsed ? item.label : undefined}
                                        className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 mb-0.5 text-sm transition-colors duration-100 ${
                                            active
                                                ? "bg-primary/10 text-primary font-semibold"
                                                : "text-medium-text hover:bg-medium-bg hover:text-strong-text"
                                        } ${collapsed ? "justify-center" : ""}`}
                                    >
                                        <Icon className={`text-base shrink-0 ${active ? "text-primary" : ""}`} />
                                        {!collapsed && <span className="truncate">{item.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer: user + logout + collapse toggle */}
            <div className="border-t border-soft-border px-2 py-2 shrink-0">
                {!collapsed && user?.username && (
                    <div className="px-2.5 py-1 text-xs text-soft-text truncate mb-1">
                        {user.username}
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    title="Déconnexion"
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-medium-text hover:bg-red-50 hover:text-red-600 transition-colors ${
                        collapsed ? "justify-center" : ""
                    }`}
                >
                    <LuLogOut className="text-base shrink-0" />
                    {!collapsed && <span>{isLoggingOut ? "..." : "Déconnexion"}</span>}
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors mt-0.5 ${
                        collapsed ? "justify-center" : ""
                    }`}
                >
                    {collapsed ? <FaChevronRight className="text-xs" /> : <FaChevronLeft className="text-xs" />}
                    {!collapsed && <span>Réduire</span>}
                </button>
            </div>
        </aside>
    );
};
