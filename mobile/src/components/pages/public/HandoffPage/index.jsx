import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";

import { useGlobalStates, Page } from "@cap-rel/smartcommon";

import { defaultSettings, updateUser } from "src/global-state";
import { useUsersServices } from "src/db";

// Consume SmartAuth tokens passed by the Blade login flow as URL fragment params,
// pin them in the global state (so useApi() picks them up) and redirect to home.
//
// Expected fragment shape (after the leading "#/handoff?"):
//   access_token=<id|jwt>
//   refresh_token=<id|jwt>
//   expires_in=<seconds>
//   login=<email>
//   userid=<int>
//   entity=<int>
//   device_uuid=<uuid>  (must be replayed via X-DEVICEID for token validation)
//
// NOTE: the primary persistence of localStorage["global"] (deviceId + user)
// happens SYNCHRONOUSLY in src/main.jsx BEFORE React mounts. This avoids the
// race against smartcommon useApi() autogen effect which would otherwise
// overwrite deviceId with a fresh v4() and break JWT validation. The work
// done in the useEffect below is the React-side mirror (redux, gst, Dexie)
// plus the hard reload that strips the tokens from the URL.
const parseHandoffFragment = () => {
    const hash = window.location.hash || "";
    const queryStart = hash.indexOf("?");
    if (queryStart < 0) return null;
    const params = new URLSearchParams(hash.substring(queryStart + 1));
    const required = ["access_token", "refresh_token", "expires_in", "login", "userid", "entity", "device_uuid"];
    for (const key of required) {
        if (!params.get(key)) {
            console.error(`Handoff: missing fragment param '${key}'`);
            return null;
        }
    }
    return {
        accessToken: params.get("access_token"),
        refreshToken: params.get("refresh_token"),
        expiresIn: Number(params.get("expires_in")),
        username: params.get("login"),
        id: Number(params.get("userid")),
        entity: Number(params.get("entity")),
        deviceUuid: params.get("device_uuid"),
    };
};

export const HandoffPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const gst = useGlobalStates();
    const { saveUser } = useUsersServices();

    useEffect(() => {
        const data = parseHandoffFragment();

        if (!data) {
            console.error("Handoff: invalid fragment, redirecting to /login");
            toast.error("Lien d'authentification invalide");
            navigate("/login", { replace: true });
            return;
        }

        const newUser = {
            id: data.id,
            username: data.username,
            entity: data.entity,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresIn: data.expiresIn,
            tokenType: "Bearer",
            rememberMe: true,
            tokenExpiry: Math.floor(Date.now() / 1000) + data.expiresIn,
            settings: defaultSettings,
        };

        // Belt and braces: localStorage["global"] should already have been
        // populated by main.jsx pre-React, but write again here in case the
        // fragment was malformed at boot (e.g. a soft navigation to /handoff
        // from inside the app, which would skip main.jsx).
        try {
            const prev = JSON.parse(window.localStorage.getItem("global") || "{}");
            const next = { ...prev, deviceId: data.deviceUuid, user: newUser };
            window.localStorage.setItem("global", JSON.stringify(next));
        } catch (err) {
            console.error("Handoff: failed to persist tokens to localStorage", err);
        }

        // Also propagate via smartcommon hooks so any in-flight render reflects it.
        gst.local.set("deviceId", data.deviceUuid);
        gst.local.set("user", newUser);

        // Persist to local IndexedDB (same as LoginPage success path).
        saveUser(newUser);

        // Mirror in the project-local auth slice so any consumer of useSelector(state.auth) sees it.
        dispatch(updateUser(newUser));

        // Wipe the fragment so tokens never leak through history / bookmarks.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        // Hard reload instead of navigate("/"): gst.local.set is async (React
        // batched setState) and a soft navigate would re-render PrivatePagesLayout
        // before useApi().user is rehydrated, making it bounce to /login. A full
        // reload re-reads localStorage at boot and lands authenticated.
        window.location.replace("/");
    }, []);

    return (
        <Page pageProps={{ className: "bg-soft-bg flex items-center justify-center" }}>
            <div className="text-soft-text text-app-sm uppercase tracking-widest font-app-bold">
                Connexion en cours...
            </div>
        </Page>
    );
};
