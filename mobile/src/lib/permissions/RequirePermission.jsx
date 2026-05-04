import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import toast from "react-hot-toast";

import { useMenu } from "./useMenu";

// Wrapper around protected routes. Reads the user's permission set
// (loaded by useMenu) and redirects to "/" with a toast if the
// permission is not granted. Children OR <Outlet> are supported (works
// both as a route element with sub-routes, and as a wrapping component
// around a single child).
export const RequirePermission = ({ perm, children }) => {
    const { has, loading } = useMenu();
    const location = useLocation();

    const allowed = !perm || has(perm);

    useEffect(() => {
        if (!loading && !allowed) {
            // FR: user-facing toast must use accents.
            toast.error("Accès refusé");
        }
    }, [loading, allowed]);

    if (loading) {
        // Avoid flicker: while we don't know yet, render nothing.
        return null;
    }

    if (!allowed) {
        return <Navigate to="/" replace state={{ from: location }} />;
    }

    return children ?? <Outlet />;
};
