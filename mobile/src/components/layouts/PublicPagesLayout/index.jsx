import { Navigate, Outlet } from "react-router-dom";
import { useApi } from "@cap-rel/smartcommon";

export const PublicPagesLayout = () => {
    const api = useApi();
    const isAuthenticated = !!api?.user;

    return !isAuthenticated ? <Outlet /> : <Navigate to="/" replace />;
};
