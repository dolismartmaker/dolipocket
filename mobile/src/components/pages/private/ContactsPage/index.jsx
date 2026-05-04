import { useViewport } from "src/lib/viewport";

import { useContactsData } from "./useContactsData";
import { ContactsPageMobile } from "./ContactsPage.mobile";
import { ContactsPageDesktop } from "./ContactsPage.desktop";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering"):
// - useContactsData() owns data fetching for both views.
// - ContactsPageMobile / ContactsPageDesktop are presentation-only.
//
// IMPORTANT: never call data hooks (useDb*, useApi.get) inside
// ContactsPage.mobile.jsx or ContactsPage.desktop.jsx -- they MUST stay
// pure render.
export const ContactsPage = () => {
    const data = useContactsData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <ContactsPageDesktop {...data} />
        : <ContactsPageMobile {...data} />;
};
