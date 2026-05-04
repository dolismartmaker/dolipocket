import { useNavigate, useLocation } from "react-router-dom";
import { LuLogOut } from "react-icons/lu";
import { FaXmark, FaCircleInfo } from "react-icons/fa6";

import { useApi, useStates, Button } from "@cap-rel/smartcommon";

import { AboutModal } from "src/components/common/AboutModal";
import { ViewportSwitcher } from "src/components/common/ViewportSwitcher";
import { API_ABORT_TIMEOUT } from "src/utils";
import { useMenu, getIconComponent } from "src/lib/permissions";

// "Plus" mobile menu. Shows the same server-driven sections as the
// desktop Sidebar but in a slide-up sheet. The "Principal" section is
// dropped because the bottom nav already exposes the Home tab.
const SECTIONS_TO_HIDE_IN_MORE = new Set(["Principal"]);

export const MoreMenu = ({ open, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useApi();

    const { menu, loading: menuLoading } = useMenu();

    const { states, set } = useStates({
        isLoggingOut: false,
        isAboutOpen: false,
    });

    const { isLoggingOut, isAboutOpen } = states ?? {};

    const handleNav = (to) => {
        onClose();
        navigate(to);
    };

    const handleLogout = () => {
        set("isLoggingOut", true);
        logout({ signal: AbortSignal.timeout(API_ABORT_TIMEOUT) })
            .catch(err => {
                console.error("POST 'logout' error", err);
            })
            .finally(() => set("isLoggingOut", false));
    };

    if (!open) return null;

    const sections = (Array.isArray(menu) ? menu : []).filter(
        (s) => !SECTIONS_TO_HIDE_IN_MORE.has(s?.title),
    );
    const showSkeleton = menuLoading && sections.length === 0;

    return (
        <>
            <AboutModal
                open={isAboutOpen}
                onClose={() => set("isAboutOpen", false)}
                appName="Dolipocket"
            />

            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel slides up from bottom */}
            <div className="fixed inset-x-0 bottom-0 z-50 bg-soft-bg rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up safe-area-bottom">
                {/* Header */}
                <div className="flex items-center justify-between px-app-base pt-app-base pb-app-xs border-b border-soft-border">
                    <h2 className="text-app-lg font-app-bold text-strong-text">Menu</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 -mr-2 text-medium-text active:text-strong-text"
                    >
                        <FaXmark className="text-xl" />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-app-base py-app-sm">
                    {showSkeleton && (
                        <div className="px-1 py-app-sm text-app-sm text-soft-text">
                            Chargement...
                        </div>
                    )}
                    {!showSkeleton && sections.map((section, sIdx) => {
                        const items = Array.isArray(section?.items) ? section.items : [];
                        if (items.length === 0) return null;
                        return (
                            <div key={section.title ?? sIdx} className="mb-app-sm">
                                {section.title && (
                                    <div className="uppercase text-soft-text font-app-bold tracking-widest text-[10px] mb-app-xxs px-1">
                                        {section.title}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    {items.map((item) => {
                                        const Icon = getIconComponent(item.icon);
                                        const isCurrent = item.route && location.pathname === item.route;
                                        return (
                                            <button
                                                key={item.id ?? item.route}
                                                type="button"
                                                onClick={() => item.route && handleNav(item.route)}
                                                className={`flex items-center gap-app-sm py-2.5 px-app-xs rounded-lg active:bg-medium-bg transition-colors duration-100 ${isCurrent ? "bg-primary/5" : ""}`}
                                            >
                                                <Icon className="text-primary text-base w-5" />
                                                <span className="text-app-base text-strong-text">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* Viewport preference toggle. Lets a user stuck in mobile
                        force the desktop view (and vice-versa) without having
                        to clear localStorage. */}
                    <div className="mb-app-sm">
                        <ViewportSwitcher density="comfortable" />
                    </div>
                </div>

                {/* Footer actions */}
                <div className="border-t border-soft-border px-app-base py-app-sm flex items-center gap-app-sm">
                    <button
                        type="button"
                        onClick={() => set("isAboutOpen", true)}
                        className="flex items-center gap-app-xs text-medium-text active:text-strong-text py-2"
                    >
                        <FaCircleInfo className="text-base" />
                        <span className="text-app-sm">À propos</span>
                    </button>
                    <div className="flex-1" />
                    <Button
                        onClick={handleLogout}
                        loading={isLoggingOut}
                        icon={LuLogOut}
                        label="Déconnexion"
                        buttonProps={{ className: "flex items-center gap-app-xs text-secondary active:brightness-90 duration-100 text-app-sm py-2" }}
                        iconProps={{ className: "text-base" }}
                    />
                </div>
            </div>
        </>
    );
};
