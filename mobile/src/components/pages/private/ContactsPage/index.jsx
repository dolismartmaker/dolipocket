import { useViewport } from "src/lib/viewport";

import { useContactsData } from "./useContactsData";
import { ContactsPageMobile } from "./ContactsPage.mobile";
import { ContactsPageDesktop } from "./ContactsPage.desktop";
import { ContactsWorkspace } from "./ContactsPage.tablet";

// Viewport router pattern (cf ~/docs/SMARTMAKER.md "Viewport-aware rendering"):
// - useContactsData() owns data fetching for the mobile + desktop views.
// - ContactsPageMobile / ContactsPageDesktop are presentation-only.
// - Tablet renders a self-contained master-detail workspace.
//
// IMPORTANT: never call data hooks (useDb*, useApi.get) inside
// ContactsPage.mobile.jsx or ContactsPage.desktop.jsx -- they MUST stay
// pure render. The viewport is frozen for the session, so branching the
// whole subtree (and therefore which data hooks run) is safe.
export const ContactsPage = () => {
    const { isTablet } = useViewport();
    if (isTablet) return <ContactsWorkspace />;
    return <ContactsListViews />;
};

const ContactsListViews = () => {
    const data = useContactsData();
    const { isDesktop } = useViewport();
    return isDesktop
        ? <ContactsPageDesktop {...data} />
        : <ContactsPageMobile {...data} />;
};
