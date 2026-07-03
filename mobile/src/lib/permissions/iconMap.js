// Maps the string icon names returned by the backend in the menu payload
// to actual react-icons/fa6 components. Keep this list in sync with the
// icon names emitted by Dolipocket\Api\HomeController::index().
import {
    FaHouse, FaUsers, FaIdCard,
    FaBoxOpen, FaWarehouse, FaBoxesStacked,
    FaFileLines, FaCartShopping, FaFileInvoice,
    FaTruck, FaTruckFast, FaTruckRampBox, FaFileInvoiceDollar,
    FaCalendarDays, FaFolderOpen,
    FaEnvelope, FaCommentsDollar, FaRepeat,
    FaDiagramProject,
    FaCircle,
} from "react-icons/fa6";

export const ICON_MAP = {
    "house":               FaHouse,
    "users":               FaUsers,
    "id-card":             FaIdCard,
    "box-open":            FaBoxOpen,
    "warehouse":           FaWarehouse,
    "boxes-stacked":       FaBoxesStacked,
    "file-lines":          FaFileLines,
    "cart-shopping":       FaCartShopping,
    "file-invoice":        FaFileInvoice,
    "truck":               FaTruck,
    "truck-fast":          FaTruckFast,
    "truck-ramp-box":      FaTruckRampBox,
    "file-invoice-dollar": FaFileInvoiceDollar,
    "calendar-days":       FaCalendarDays,
    "folder-open":         FaFolderOpen,
    "envelope":            FaEnvelope,
    "comments-dollar":     FaCommentsDollar,
    "repeat":              FaRepeat,
    "diagram-project":     FaDiagramProject,
};

// Fallback to a neutral circle icon if the backend ships an unknown name.
export const getIconComponent = (name) => ICON_MAP[name] ?? FaCircle;
