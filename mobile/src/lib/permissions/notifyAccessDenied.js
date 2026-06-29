import toast from "react-hot-toast";

// Centralised 403 handler.
//
// Since smartcommon's useApi no longer treats a 403 as a dead session
// (only 401 / invalid-JSON ejects to /login), a 403 now surfaces as a
// normal error meaning "authenticated, but no right on THIS resource".
// We show a single explicit toast instead of logging the user out.
//
// Returns true when the error WAS a 403 it handled, so callers can short
// circuit their own generic error toast and avoid a duplicate message.
export const notifyAccessDenied = (err) => {
    const status = err?.response?.status ?? err?.status ?? null;
    if (status !== 403) return false;
    // FR: user-facing toast must use accents.
    toast.error("Vous n'avez pas le droit d'accéder à cette ressource");
    return true;
};
