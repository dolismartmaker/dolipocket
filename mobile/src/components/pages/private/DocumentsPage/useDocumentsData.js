import { useNavigate } from "react-router-dom";
import { FaBuilding, FaBox, FaProjectDiagram, FaTools, FaTags } from "react-icons/fa";

import { useStates } from "@cap-rel/smartcommon";

// Object types supported by SmartAuth ObjectDocumentController.
// Each entry exposes a label, an icon, and the slug used in the URL.
export const OBJECT_TYPES = [
    { type: "thirdparty", label: "Tiers", icon: FaBuilding, color: "text-blue-700 bg-blue-100" },
    { type: "product", label: "Produits", icon: FaBox, color: "text-amber-700 bg-amber-100" },
    { type: "project", label: "Projets", icon: FaProjectDiagram, color: "text-emerald-700 bg-emerald-100" },
    { type: "intervention", label: "Interventions", icon: FaTools, color: "text-purple-700 bg-purple-100" },
    { type: "category", label: "Catégories", icon: FaTags, color: "text-pink-700 bg-pink-100" },
];

// Shared state for DocumentsPage (mobile + desktop). No async fetch: this page
// is a small picker (object type + numeric id) that navigates to the per-object
// documents view. State lives here so both views stay pure render (cf
// .claude/CLAUDE.md viewport-aware pattern).
export const useDocumentsData = () => {
    const navigate = useNavigate();

    const { states, set } = useStates({
        selectedType: "thirdparty",
        objectId: "",
    });

    const { selectedType, objectId } = states ?? {};

    const handleBack = () => navigate("/");

    const handleSubmit = (e) => {
        e?.preventDefault?.();
        const id = parseInt(objectId, 10);
        if (!id || id <= 0) return;
        navigate(`/documents/${selectedType}/${id}`);
    };

    return {
        objectTypes: OBJECT_TYPES,
        selectedType,
        objectId,
        set,
        handleBack,
        handleSubmit,
    };
};
