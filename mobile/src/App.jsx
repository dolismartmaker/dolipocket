import { I18nextProvider, Router, Head, SmartCommonProvider } from "src/components";
import { ViewportProvider } from "src/lib/viewport";

// Note: <Toaster /> is already mounted by SmartCommonProvider (smartcommon
// Provider includes one). Adding another here would create two react-hot-toast
// instances listening on the same bus.
//
// <ViewportProvider> wraps the Router so any page can call useViewport()
// to render a mobile-only or desktop-only view. Pattern under validation
// for promotion to @cap-rel/smartcommon (cf ~/docs/SMARTMAKER.md
// "Viewport-aware rendering").
export const App = () => {
    return (
        <SmartCommonProvider>
            <ViewportProvider>
                <I18nextProvider>
                    <Head />
                    <Router />
                </I18nextProvider>
            </ViewportProvider>
        </SmartCommonProvider>
    );
};
