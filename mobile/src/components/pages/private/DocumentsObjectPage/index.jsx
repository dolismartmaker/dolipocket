import { useViewport } from "src/lib/viewport";

import { useDocumentsObjectData } from "./useDocumentsObjectData";
import { DocumentsObjectPageMobile } from "./DocumentsObjectPage.mobile";
import { DocumentsObjectPageDesktop } from "./DocumentsObjectPage.desktop";

// Viewport router (cf .claude/CLAUDE.md viewport-aware pattern):
//   - mobile           -> gradient header + document cards + fixed upload bar
//   - tablet / desktop -> sticky toolbar (upload button) + dense table
//
// useDocumentsObjectData() owns data + upload/download; views are pure render.
export const DocumentsObjectPage = () => {
    const data = useDocumentsObjectData();
    const { isMobile } = useViewport();
    return isMobile ? <DocumentsObjectPageMobile {...data} /> : <DocumentsObjectPageDesktop {...data} />;
};

export default DocumentsObjectPage;
