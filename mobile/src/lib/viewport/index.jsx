// Viewport 3-tier primitives, now sourced from @cap-rel/smartcommon (>= 1.0.335).
//
// This file used to host a local, binary mobile/desktop implementation
// (breakpoint 768px). The 3-tier system (mobile / tablet / desktop) has been
// promoted into the shared library, so this module is now a thin re-export
// shim: every existing consumer keeps importing from "src/lib/viewport" and
// automatically gains `isTablet`, the pointer-aware auto-detection and the
// per-device persistence helpers without touching its import path.
//
// Detection model (cf ~/dev/smartcommon/docs/viewport.md):
//   - (pointer: fine)                       -> desktop (mouse / trackpad)
//   - (pointer: coarse) + short side >= 600 -> tablet  (landscape, touch)
//   - otherwise                             -> mobile  (phone, portrait)
// The viewport is FROZEN for the session (resolved once at provider mount).
//
// Reference: smartcommon ViewportProvider / useViewport / DualShell /
// detectAutoViewport and the related constants.

export {
    ViewportProvider,
    useViewport,
    DualShell,
    detectAutoViewport,
    DESKTOP_MEDIA_QUERY,
    TABLET_MEDIA_QUERY,
    MOBILE_MEDIA_QUERY,
    MOBILE_MAX_SHORT_SIDE_PX,
    VIEWPORT_PREFERENCE_KEY,
} from "@cap-rel/smartcommon";
