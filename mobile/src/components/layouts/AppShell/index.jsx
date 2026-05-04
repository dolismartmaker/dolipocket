import { Outlet } from "react-router-dom";
import { useStates } from "@cap-rel/smartcommon";

import { BottomNav } from "src/components/common/BottomNav";
import { MoreMenu } from "src/components/common/MoreMenu";
import { Sidebar } from "src/components/common/Sidebar";
import { TopBar } from "src/components/common/TopBar";

export const AppShell = () => {
    const { states, set } = useStates({
        moreOpen: false,
        sidebarCollapsed: false,
    });
    const { moreOpen, sidebarCollapsed } = states ?? {};

    return (
        <div className="md:flex md:h-screen md:overflow-hidden">
            {/* Desktop sidebar */}
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => set("sidebarCollapsed", !sidebarCollapsed)}
            />

            {/* Main content area */}
            <div className="flex-1 flex flex-col md:overflow-hidden">
                {/* Desktop top bar */}
                <TopBar />

                {/* Page content: scrollable on desktop, natural flow on mobile */}
                <main className="flex-1 md:overflow-y-auto pb-bottom-nav md:pb-0">
                    <Outlet />
                </main>
            </div>

            {/* Mobile bottom nav + more menu */}
            <div className="md:hidden">
                <BottomNav onMorePress={() => set("moreOpen", true)} />
                <MoreMenu open={moreOpen} onClose={() => set("moreOpen", false)} />
            </div>
        </div>
    );
};
