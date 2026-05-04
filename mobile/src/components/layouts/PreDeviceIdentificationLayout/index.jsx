import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";

export const PreDeviceLayout = () => {
    const user = useSelector(state => state.auth?.user);
    const { deviceOptions } = user || {};

    return deviceOptions ? <Outlet /> : <Navigate to="/" replace />;
};
