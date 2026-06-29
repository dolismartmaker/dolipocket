import { Provider, ConfirmProvider } from "@cap-rel/smartcommon";

import { reducers } from "src/global-state";
import { API_URL } from "src/utils";

// Single smartcommon <Provider>, configured for HASH routing: dolipocket is
// served under a subpath (/custom/dolipocket/pwa/) and the Blade login handoff
// redirects to <PWA>/#/handoff?... -- both require a HashRouter. Since
// smartcommon's Router became configurable (config.router), we no longer
// hand-roll the provider stack: the Provider orchestrates everything and just
// mounts a HashRouter instead of a BrowserRouter.
//
// ConfirmProvider is mounted around the children because the bundled Provider
// does not include it (pages call useConfirm()).
export const SmartCommonProvider = (props) => {
    const { children } = props;

    const config = {
        api: {
            prefixUrl: API_URL,
        },
        globalState: {
            reducers,
        },
        db: {
            name: import.meta.env.VITE_APP_NAME || "SmartMaker",
        },
        // BrowserRouter (default) cannot serve under a subpath without a basename
        // and would break the #/handoff flow -> use the hash router.
        router: "hash",
    };

    return (
        <Provider config={config}>
            <ConfirmProvider>
                {children}
            </ConfirmProvider>
        </Provider>
    );
};
