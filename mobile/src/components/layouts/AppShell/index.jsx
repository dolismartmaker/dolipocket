import { Outlet } from "react-router-dom";
import { useStates } from "@cap-rel/smartcommon";

import { BottomNav } from "src/components/common/BottomNav";
import { MoreMenu } from "src/components/common/MoreMenu";
import { NavRail } from "src/components/common/NavRail";
import { Sidebar } from "src/components/common/Sidebar";
import { TopBar } from "src/components/common/TopBar";
import { useViewport } from "src/lib/viewport";

// Viewport-aware application shell. The shell is now chosen in JS via
// useViewport() (the viewport is frozen for the session, so there is no
// remount risk mid-session) instead of the previous CSS `md:` toggling.
// This is what lets the tablet get its own dedicated rail shell rather than
// inheriting the desktop sidebar or the mobile bottom nav.
//
//   isMobile  -> bottom nav + slide-up MoreMenu  (phone, portrait)
//   isTablet  -> lateral NavRail                 (tablet, landscape, touch)
//   isDesktop -> collapsible Sidebar + TopBar    (mouse, hover)
export const AppShell = () => {
    const { isMobile, isTablet } = useViewport();
    const { states, set } = useStates({
        moreOpen: false,
        sidebarCollapsed: false,
    });
    const { moreOpen, sidebarCollapsed } = states ?? {};

    // Tablet: touch-first lateral rail + natural-flow scrollable content.
    if (isTablet) {
        return (
            <div className="flex h-screen overflow-hidden">
                <NavRail />
                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        );
    }

    // Mobile: fullscreen content + fixed bottom nav + slide-up more menu.
    if (isMobile) {
        return (
            <div>
                <main className="pb-bottom-nav">
                    <Outlet />
                </main>
                <BottomNav onMorePress={() => set("moreOpen", true)} />
                <MoreMenu open={moreOpen} onClose={() => set("moreOpen", false)} />
            </div>
        );
    }

    // Desktop: collapsible sidebar + sticky top bar.
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => set("sidebarCollapsed", !sidebarCollapsed)}
            />
            <div className="flex-1 flex flex-col overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
