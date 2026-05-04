// Viewport-aware rendering primitives.
//
// Goal: replace per-component responsive Tailwind classes by a clean
// "two-render" architecture (mobile vs desktop) while keeping data
// fetching and business logic shared.
//
// Detection model: the viewport is FROZEN for the whole session.
// - At boot we read a persisted preference ('auto' | 'desktop' | 'mobile')
//   from localStorage. Default 'auto'.
// - 'auto' is resolved ONCE via matchMedia('(min-width: 768px)').
// - The resolved value never changes again during the session, so a
//   browser resize / devtools toggle / orientation change has zero effect.
// - The user can change the preference via setPreference(). After confirm,
//   we persist + reload the page so the new viewport is picked up cleanly.
//
// Pattern under validation in dolipocket. Once stable it will be moved
// to @cap-rel/smartcommon. See ~/docs/SMARTMAKER.md "Viewport-aware
// rendering" for the convention.

import { createContext, useContext, useMemo, useState } from "react";

// Tailwind v4 default `md:` breakpoint. Single source of truth: any
// JS-level decision must use this same constant so it cannot drift
// from the CSS-level breakpoint.
export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

// Reused across smartcommon once promoted -> namespace key with smartcommon.
export const VIEWPORT_PREFERENCE_KEY = "smartcommon.viewport.preference";

const VALID_PREFERENCES = ["auto", "desktop", "mobile"];

const readStoredPreference = () => {
    if (typeof window === "undefined") return "auto";
    try {
        const raw = window.localStorage?.getItem(VIEWPORT_PREFERENCE_KEY);
        if (raw && VALID_PREFERENCES.includes(raw)) return raw;
    } catch (e) {
        // Storage access can throw in private mode / sandboxed iframes.
        // Fall back to 'auto' silently, this is non-critical.
    }
    return "auto";
};

const detectAuto = () => {
    if (typeof window === "undefined") return "mobile";
    if (typeof window.matchMedia !== "function") return "mobile";
    return window.matchMedia(DESKTOP_MEDIA_QUERY).matches ? "desktop" : "mobile";
};

const resolveViewport = (preference) => {
    if (preference === "desktop") return "desktop";
    if (preference === "mobile") return "mobile";
    return detectAuto();
};

const ViewportContext = createContext(null);

export const ViewportProvider = ({ children }) => {
    // Both values are computed ONCE at provider mount. No effect, no
    // listener: the viewport is intentionally frozen for the session.
    const [{ preference, viewport }] = useState(() => {
        const pref = readStoredPreference();
        return { preference: pref, viewport: resolveViewport(pref) };
    });

    const setPreference = (next) => {
        if (!VALID_PREFERENCES.includes(next)) {
            throw new Error(`Invalid viewport preference: ${next}`);
        }
        if (next === preference) return;

        const ok = typeof window !== "undefined"
            && typeof window.confirm === "function"
            && window.confirm(
                "Changer la vue va recharger l'application. Continuer ?",
            );
        if (!ok) return;

        try {
            window.localStorage?.setItem(VIEWPORT_PREFERENCE_KEY, next);
        } catch (e) {
            // If storage is unavailable we still reload, but the choice
            // won't survive a future session.
        }
        window.location.reload();
    };

    const value = useMemo(
        () => ({
            viewport,
            isMobile: viewport === "mobile",
            isDesktop: viewport === "desktop",
            preference,
            setPreference,
        }),
        // setPreference is stable enough (closes over `preference` only,
        // which itself never changes during the session). Keeping it out
        // of the deps avoids creating a new object every render for nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [viewport, preference],
    );

    return (
        <ViewportContext.Provider value={value}>
            {children}
        </ViewportContext.Provider>
    );
};

export const useViewport = () => {
    const ctx = useContext(ViewportContext);
    if (!ctx) {
        // Fail loud: a missing provider would silently fall back to mobile
        // and hide layout bugs in production.
        throw new Error(
            "useViewport must be used inside <ViewportProvider>. " +
            "Wrap your <App /> with <ViewportProvider> (cf ~/docs/SMARTMAKER.md).",
        );
    }
    return ctx;
};

// Sugar helper: pick between two views without a data layer in between.
//
// When data must be SHARED between mobile and desktop (typical case),
// do NOT use DualShell: call useViewport() in your page component, fetch
// data there with a `useXxxData()` hook, then render the chosen view
// with the data passed as props.
export const DualShell = ({ mobile, desktop }) => {
    const { isDesktop } = useViewport();
    return isDesktop ? (desktop ?? null) : (mobile ?? null);
};
