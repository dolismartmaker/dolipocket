import { useNavigate, useLocation } from "react-router-dom";
import { LuLogOut } from "react-icons/lu";

import { useApi, useStates } from "@cap-rel/smartcommon";

import { API_ABORT_TIMEOUT } from "src/utils";
import { useMenu, getIconComponent } from "src/lib/permissions";
import { ViewportSwitcher } from "src/components/common/ViewportSwitcher";

// Tablet navigation rail. Touch-first lateral bar (~84px) that stays visible
// at all times and exposes the server-driven menu (useMenu) as large vertical
// targets (icon + short label, >= 64px tall = comfortable finger tap).
//
// Unlike the desktop Sidebar (mouse, hover, collapse-to-16px) or the mobile
// BottomNav (5 hardcoded slots), the rail shows every permitted menu item in a
// scrollable column, which fits the tablet landscape ergonomics described in
// ~/dev/smartcommon/docs/viewport.md.

// Active-state computation, reused verbatim from the Sidebar: a "/" route only
// matches the exact root; any other route matches by prefix so child pages
// (e.g. /thirdparties/42) still highlight their parent entry.
const isActiveRoute = (pathname, route) => {
    if (!route) return false;
    if (route === "/" && pathname === "/") return true;
    if (route !== "/" && pathname.startsWith(route)) return true;
    return false;
};

export const NavRail = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, user } = useApi();

    const { menu, loading: menuLoading } = useMenu();

    const { states, set } = useStates({ accountOpen: false, isLoggingOut: false });
    const { accountOpen, isLoggingOut } = states ?? {};

    const handleLogout = () => {
        set("isLoggingOut", true);
        logout({ signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
            .catch((err) => console.error("POST 'logout' error", err))
            .finally(() => set("isLoggingOut", false));
    };

    // Server-driven sections. We never fall back to a hardcoded list: either
    // the menu is loading (skeleton) or it loaded empty (no entries, chrome
    // stays). Sections are flattened in the rail (no titles) with a thin
    // divider between groups.
    const sections = Array.isArray(menu) ? menu : [];
    const showSkeleton = menuLoading && sections.length === 0;

    const accountInitial = (user?.username ?? "?").trim().charAt(0).toUpperCase() || "?";

    return (
        <aside className="relative flex flex-col w-20 shrink-0 bg-soft-bg border-r border-soft-border h-screen sticky top-0 z-30">
            {/* Brand */}
            <div className="flex items-center justify-center h-14 border-b border-soft-border shrink-0">
                <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary to-tertiary flex items-center justify-center text-white font-bold text-base">
                    D
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-2 px-1.5">
                {showSkeleton && (
                    <div className="px-1 py-3 text-[10px] text-soft-text text-center">...</div>
                )}
                {!showSkeleton && sections.map((section, sIdx) => {
                    const items = Array.isArray(section?.items) ? section.items : [];
                    if (items.length === 0) return null;
                    return (
                        <div key={section.title ?? sIdx} className="mb-1">
                            {sIdx > 0 && (
                                <div className="border-t border-soft-border mx-2 my-1.5" />
                            )}
                            {items.map((item) => {
                                const Icon = getIconComponent(item.icon);
                                const active = isActiveRoute(location.pathname, item.route);
                                return (
                                    <button
                                        key={item.id ?? item.route}
                                        type="button"
                                        onClick={() => item.route && navigate(item.route)}
                                        title={item.label}
                                        className={`relative w-full flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 mb-1 min-h-16 transition-colors duration-100 ${
                                            active
                                                ? "bg-primary/10 text-primary"
                                                : "text-medium-text active:bg-medium-bg"
                                        }`}
                                    >
                                        {active && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-primary" />
                                        )}
                                        <Icon className={`text-xl shrink-0 ${active ? "text-primary" : ""}`} />
                                        <span className="text-[10px] font-medium leading-tight text-center w-full truncate px-0.5">
                                            {item.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer: account button (opens a popover with view switcher + logout) */}
            <div className="border-t border-soft-border p-2 shrink-0 flex justify-center">
                <button
                    type="button"
                    onClick={() => set("accountOpen", !accountOpen)}
                    title={user?.username ?? "Compte"}
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base transition-colors ${
                        accountOpen ? "bg-primary text-white" : "bg-primary/10 text-primary active:bg-primary/20"
                    }`}
                >
                    {accountInitial}
                </button>
            </div>

            {/* Account popover, anchored to the rail bottom, opens to the right */}
            {accountOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => set("accountOpen", false)}
                    />
                    <div className="absolute z-50 left-full bottom-2 ml-2 w-64 bg-white rounded-xl border border-soft-border shadow-lg overflow-hidden">
                        {user?.username && (
                            <div className="px-4 py-3 border-b border-soft-border">
                                <div className="text-sm font-semibold text-strong-text truncate">
                                    {user.username}
                                </div>
                            </div>
                        )}
                        <div className="p-2 border-b border-soft-border">
                            <ViewportSwitcher
                                density="comfortable"
                                onAfterSelect={() => set("accountOpen", false)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-medium-text active:bg-red-50 active:text-red-600 transition-colors"
                        >
                            <LuLogOut className="text-base shrink-0" />
                            <span>{isLoggingOut ? "Déconnexion..." : "Déconnexion"}</span>
                        </button>
                    </div>
                </>
            )}
        </aside>
    );
};
