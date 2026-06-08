import { useCallback } from "react";

import { useApi } from "@cap-rel/smartcommon";

import { I18nextProvider, Router, Head, SmartCommonProvider } from "src/components";
import { ViewportProvider } from "src/lib/viewport";

// Note: <Toaster /> is already mounted by SmartCommonProvider (smartcommon
// Provider includes one). Adding another here would create two react-hot-toast
// instances listening on the same bus.
//
// <ViewportProvider> (from @cap-rel/smartcommon via the src/lib/viewport shim)
// wraps the Router so any page can call useViewport() to render a mobile /
// tablet / desktop view. It is mounted INSIDE SmartCommonProvider so the
// persistence wrapper below can reach useApi().

// Best-effort per-device persistence of the viewport preference (smartAuth
// 2.0.21+). When the user switches the view, we try to store the choice on the
// current logical user_device so other PWAs installed on the same device pick
// it up. Everything here degrades gracefully: localStorage is the primary
// store (handled inside ViewportProvider), this is only an enrichment.
const ViewportPersistence = ({ children }) => {
    const api = useApi();

    const onPreferenceChange = useCallback(async (next) => {
        try {
            if (typeof api.listUserDevices !== "function"
                || typeof api.setDeviceViewportMode !== "function") {
                return;
            }
            const res = await api.listUserDevices();
            const devices = Array.isArray(res?.devices)
                ? res.devices
                : (Array.isArray(res) ? res : []);
            if (devices.length === 0) return;

            // Identify the current logical device: prefer the uuid persisted by
            // the handoff in gst.local ("global" key), fall back to the label
            // exposed on the authenticated user.
            let deviceUuid = null;
            try {
                deviceUuid = JSON.parse(window.localStorage.getItem("global") || "{}")?.deviceId ?? null;
            } catch (_) { /* private mode / malformed */ }

            const current = (deviceUuid && devices.find((d) => d.uuid === deviceUuid))
                || devices.find((d) => d.label && d.label === api.user?.currentDeviceLabel);

            if (current?.id != null) {
                await api.setDeviceViewportMode(current.id, next);
            }
        } catch (err) {
            // Never block the view switch on a persistence failure.
            console.error("[viewport] per-device persistence (best-effort) failed", err);
        }
    }, [api]);

    return (
        <ViewportProvider onPreferenceChange={onPreferenceChange}>
            {children}
        </ViewportProvider>
    );
};

export const App = () => {
    return (
        <SmartCommonProvider>
            <ViewportPersistence>
                <I18nextProvider>
                    <Head />
                    <Router />
                </I18nextProvider>
            </ViewportPersistence>
        </SmartCommonProvider>
    );
};
