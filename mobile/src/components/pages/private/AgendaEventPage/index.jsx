import { useViewport } from "src/lib/viewport";

import { useAgendaEventData } from "./useAgendaEventData";
import { AgendaEventPageMobile } from "./AgendaEventPage.mobile";
import { AgendaEventPageDesktop } from "./AgendaEventPage.desktop";

// Viewport router for the agenda event detail page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). All data + handlers live in
// useAgendaEventData; the two views are presentational only.
export const AgendaEventPage = () => {
    const data = useAgendaEventData();
    const { isDesktop } = useViewport();

    return isDesktop
        ? <AgendaEventPageDesktop {...data} />
        : <AgendaEventPageMobile {...data} />;
};
