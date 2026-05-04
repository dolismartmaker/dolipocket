import { Toaster as ReactToaster} from "react-hot-toast";

export const Toaster = () => {
    return (
        <ReactToaster
            position={`top-center`}
            // toastOptions={{
            //     style: {
            //         backgroundColor: darkMode ? "#0f172a" : "white",
            //         color: darkMode ? "white" : "#0f172a",
            //     }
            // }}
        />
    );
};