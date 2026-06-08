import { useViewport } from "src/lib/viewport";

import { DocumentLinesEditorDesktop } from "./DocumentLinesEditor.desktop";
import { DocumentLinesEditorMobile } from "./DocumentLinesEditor.mobile";

// <DocumentLinesEditor>
//
// Viewport router for the document lines editor (cf .claude/CLAUDE.md
// "Architecture viewport-aware"). Both variants consume the shared
// useDocumentLinesEditor() hook so add/update/delete/move semantics
// are identical -- only the rendering differs.
//
// Tablet: with the 3-tier viewport (isDesktop = pointer:fine only), tablets
// resolve isDesktop=false and intentionally render the touch-first Mobile
// variant (cards + bottom-sheet), which is the right ergonomics for a finger
// (the desktop variant uses tiny inline <input> cells made for a mouse).
//
// API (unchanged from the historical version, drop-in compatible):
//   <DocumentLinesEditor
//       docId={proposal.id}
//       lines={proposal.lines}
//       dataSource={dbProposals}
//       onChange={(updated) => setProposal(updated)}
//       readOnly={proposal.statut !== 0}
//   />
export const DocumentLinesEditor = (props) => {
    const { isDesktop } = useViewport();
    return isDesktop
        ? <DocumentLinesEditorDesktop {...props} />
        : <DocumentLinesEditorMobile {...props} />;
};
