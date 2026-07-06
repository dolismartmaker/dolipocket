export const API_URL     = import.meta.env.VITE_API_URL;
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;
export const APP_NAME    = import.meta.env.VITE_APP_NAME || "Dolipocket";
// Optional brand/company logo shown on the login hero. URL or bundled asset
// path; when empty (or the image fails to load) the UI falls back to a letter
// avatar built from APP_NAME. Lets a deployment show its own logo without
// touching code.
export const APP_LOGO    = import.meta.env.VITE_APP_LOGO || "";

export const LOCALES     = import.meta.env.VITE_LOCALES.split(",");

// Human-readable host of the backend this build targets. Lets the user see
// which Dolipocket / Dolibarr instance they are about to sign in to (there can
// be many deployments, each with its own VITE_API_URL).
export const API_HOST = (() => {
    try {
        return new URL(API_URL).host;
    } catch {
        return "";
    }
})();