import { useViewport } from "src/lib/viewport";

import { AgendaEventEditPage as AgendaEventEditPageMobile } from "./AgendaEventEditPage.mobile";
import { AgendaEventEditPageDesktop } from "./AgendaEventEditPage.desktop";
import { useAgendaEventEditData } from "./useAgendaEventEditData";

// Viewport router for the agenda event edit page (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Mobile keeps its historical monolithic
// implementation. Desktop uses <AutoForm> driven by GET /event/describe.
const DesktopWrapper = () => {
    const data = useAgendaEventEditData();
    return <AgendaEventEditPageDesktop {...data} />;
};

export const AgendaEventEditPage = () => {
    const { isDesktop } = useViewport();
    return isDesktop ? <DesktopWrapper /> : <AgendaEventEditPageMobile />;
};
