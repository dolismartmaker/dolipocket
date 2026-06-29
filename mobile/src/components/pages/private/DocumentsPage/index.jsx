import { useViewport } from "src/lib/viewport";

import { useDocumentsData } from "./useDocumentsData";
import { DocumentsPageMobile } from "./DocumentsPage.mobile";
import { DocumentsPageDesktop } from "./DocumentsPage.desktop";

// Viewport router (cf .claude/CLAUDE.md viewport-aware pattern):
//   - mobile           -> gradient header + stacked cards
//   - tablet / desktop -> sticky toolbar + single constrained panel
//
// useDocumentsData() owns the picker state; the two views are pure render.
export const DocumentsPage = () => {
    const data = useDocumentsData();
    const { isMobile } = useViewport();
    return isMobile ? <DocumentsPageMobile {...data} /> : <DocumentsPageDesktop {...data} />;
};

export default DocumentsPage;
