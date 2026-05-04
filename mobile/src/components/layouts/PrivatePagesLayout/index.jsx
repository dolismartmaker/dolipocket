import { Navigate, Outlet } from "react-router-dom";
import { useApi } from "@cap-rel/smartcommon";

export const PrivatePagesLayout = () => {
    const api = useApi();
    const isAuthenticated = !!api?.user;

    return !isAuthenticated ? <Navigate to="/login" replace /> : <Outlet />;
};