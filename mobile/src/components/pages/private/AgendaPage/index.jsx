import { useViewport } from "src/lib/viewport";

import { useAgendaData } from "./useAgendaData";
import { AgendaPageMobile } from "./AgendaPage.mobile";
import { AgendaPageDesktop } from "./AgendaPage.desktop";

// Full calendar agenda (replaces the former flat list). Viewport router:
//   - mobile  -> month / day / list, compact cells (dots instead of chips)
//   - desktop / tablet -> month / week / day / list, full chips + colour legend
//
// useAgendaData() owns all state + handlers; the two views are pure pass-through
// to <Calendar> so the data hook runs once in the selected branch (the viewport
// is frozen for the session -> no remount risk).
const DESKTOP_VIEWS = ["month", "week", "day", "list"];
const MOBILE_VIEWS = ["month", "day", "list"];

export const AgendaPage = () => {
    const { isMobile } = useViewport();

    const data = useAgendaData({
        availableViews: isMobile ? MOBILE_VIEWS : DESKTOP_VIEWS,
        defaultView: "month",
    });

    return isMobile ? <AgendaPageMobile {...data} /> : <AgendaPageDesktop {...data} />;
};
