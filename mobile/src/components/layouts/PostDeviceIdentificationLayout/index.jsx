import { useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";

export const PostDeviceIdentificationLayout = () => {
    const user = useSelector(state => state.auth?.user);
    const { deviceOptions } = user || {};

    return deviceOptions ? <Navigate to="/device-identification" replace /> : <Outlet />;
};
