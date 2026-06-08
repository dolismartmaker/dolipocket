import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@cap-rel/smartcommon/dist/smartcommon-style.css";
import "./assets/styles/style.css";
// import "./assets/styles/base.css";
// import "./assets/styles/theme.css";

import { App } from "./App";
import { defaultSettings } from "./global-state";

// ---------- Pre-React handoff consumption ----------
// When the Blade public site redirects here with #/handoff?access_token=...,
// we MUST seed localStorage["global"] with deviceId + user BEFORE React mounts.
// Reason: smartcommon's useApi() runs a useEffect on first render that, when
// gst.values.deviceId is undefined, generates a fresh v4() and writes it to
// localStorage. That effect fires AFTER HandoffPage's own useEffect (effects
// run deepest-first, both belong to the same first commit), so the autogen
// wins the race and overwrites the device_uuid that Blade used to seed the
// JWT salt2. The token then fails signature verification on every API call
// and useApi clears the user, bouncing the PWA back to /login.
//
// Doing it here, synchronously before createRoot(), guarantees that:
//   - useGlobalStates() hydrates initialStates from localStorage["global"]
//     and sees { deviceId, user } already populated.
//   - useApi()'s autogen effect's `isUndefined(deviceId)` check evaluates
//     to false on the very first render, so it skips the autogen entirely.
//
// We still keep HandoffPage as a route target to render a "Connecting..."
// splash and trigger the hard reload to wipe the fragment from the URL.
const tryConsumeHandoffFragment = () => {
    const hash = window.location.hash || "";
    const idx = hash.indexOf("?");
    if (idx < 0 || !hash.includes("/handoff")) {
        return;
    }
    const params = new URLSearchParams(hash.substring(idx + 1));
    const required = ["access_token", "refresh_token", "expires_in", "login", "userid", "entity", "device_uuid"];
    for (const key of required) {
        if (!params.get(key)) {
            // Missing param - bail out, HandoffPage will toast and redirect to /login.
            return;
        }
    }
    const deviceUuid = params.get("device_uuid");
    const expiresIn = Number(params.get("expires_in"));
    const newUser = {
        id: Number(params.get("userid")),
        username: params.get("login"),
        entity: Number(params.get("entity")),
        accessToken: params.get("access_token"),
        refreshToken: params.get("refresh_token"),
        expiresIn,
        tokenType: "Bearer",
        rememberMe: true,
        tokenExpiry: Math.floor(Date.now() / 1000) + expiresIn,
        settings: defaultSettings,
    };
    try {
        const prev = JSON.parse(window.localStorage.getItem("global") || "{}");
        const next = { ...prev, deviceId: deviceUuid, user: newUser };
        window.localStorage.setItem("global", JSON.stringify(next));
    } catch (err) {
        // localStorage write failed - HandoffPage will still try via the React tree.
        console.error("DPK pre-react handoff persist failed", err);
    }
};

tryConsumeHandoffFragment();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
