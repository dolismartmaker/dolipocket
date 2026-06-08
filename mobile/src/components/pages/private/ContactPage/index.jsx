import { useParams } from "react-router-dom";

import { useViewport } from "src/lib/viewport";

import { useContactData } from "./useContactData";
import { ContactPageMobile } from "./ContactPage.mobile";
import { ContactPageDesktop } from "./ContactPage.desktop";
import { ContactsWorkspace } from "../ContactsPage/ContactsPage.tablet";

// Viewport router for the contact detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). On tablet, the detail route renders the
// same master-detail workspace as the list, with the record preselected
// from the URL (deep-link support) while keeping the list visible on the
// left. Mobile and desktop keep their presentational views fed by
// useContactData.
export const ContactPage = () => {
    const { isTablet } = useViewport();
    const { id } = useParams();
    if (isTablet) return <ContactsWorkspace initialId={id} />;
    return <ContactDetailViews />;
};

const ContactDetailViews = () => {
    const data = useContactData();
    const { isDesktop } = useViewport();
    return isDesktop
        ? <ContactPageDesktop {...data} />
        : <ContactPageMobile {...data} />;
};
