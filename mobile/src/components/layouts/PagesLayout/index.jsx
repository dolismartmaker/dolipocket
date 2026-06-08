import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Outlet } from "react-router-dom";

import { setVariable } from "@cap-rel/smartcommon";

import { useViewport } from "src/lib/viewport";

// Viewport-aware page wrapper, inspired by the proven dsd/mobile pattern:
// - On mobile, we keep the legacy `fixed inset-x-0 top-0 h-dvh` so the PWA
//   feels like a native fullscreen app.
// - On desktop, we switch to `min-h-screen` (natural flow) so the page
//   content stays correctly under the AppShell sticky TopBar/Sidebar
//   (which have z-30 / z-20 and would otherwise visually mask any
//   `fixed inset-0` content).
//
// This single tweak removes the need to either (a) wrap each desktop list
// page in a custom <Page responsive={false} contentProps={...}> override or
// (b) route list pages outside the AnimationLayout. Cf docs/DATATABLE_SPEC.md
// session #13 discussion + ~/dev/dsd/mobile/src/components/layouts/PagesLayout/.
export const PagesLayout = () => {
    const lastSettings = useSelector(state => state.lastSettings);
    const user = useSelector(state => state.user);
    const settings = user?.settings;
    const { isMobile } = useViewport();

    const currentSettings = settings ?? lastSettings ?? {};

    const { darkMode, scale } = currentSettings;

    useEffect(() => {
        setVariable("--scale", scale);

        if (darkMode) {
            document.querySelector("html").classList.add("dark");
        } else {
            document.querySelector("html").classList.remove("dark");
        }
    }, [currentSettings]);

    return (
        <div className={`bg-medium-bg ${isMobile ? "fixed inset-x-0 top-0 h-dvh" : "min-h-screen"}`}>
            <Outlet />
        </div>
    );
};
