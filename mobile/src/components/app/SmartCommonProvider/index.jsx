import { Provider, ConfirmProvider } from "@cap-rel/smartcommon";

import { reducers } from "src/global-state";
import { API_URL } from "src/utils";

export const SmartCommonProvider = (props) => {
    const { children } = props;

    const config = {
            api: {
                prefixUrl: API_URL,
            },
            globalState: {
                reducers
            },
            db: {
                name: import.meta.env.VITE_APP_NAME || "SmartMaker"
            },
            // pages: {
            //     "*": "fade"
            // }
        }

    // ConfirmProvider must wrap the Router so any page calling useConfirm()
    // resolves the context. The bundled smartcommon Provider does not include
    // it, so we mount it explicitly here.
    return (
        <Provider config={config}>
            <ConfirmProvider>
                {children}
            </ConfirmProvider>
        </Provider>
    );
};