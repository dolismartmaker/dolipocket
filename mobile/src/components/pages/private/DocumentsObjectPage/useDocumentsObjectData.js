import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaFileAlt, FaFileImage, FaFilePdf } from "react-icons/fa";

import { useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbDocuments } from "src/db/stores/documents/useDbDocuments";

export const TYPE_LABELS = {
    thirdparty: "Tiers",
    product: "Produit",
    project: "Projet",
    intervention: "Intervention",
    category: "Catégorie",
};

const ALLOWED_TYPES = new Set(["thirdparty", "product", "project", "intervention", "category"]);

// Pick a file icon component for a given mime type.
export const pickIcon = (mime) => {
    if (!mime) return FaFileAlt;
    if (mime.startsWith("image/")) return FaFileImage;
    if (mime === "application/pdf") return FaFilePdf;
    return FaFileAlt;
};

// Format a byte count into a short human readable string.
export const formatSize = (size) => {
    if (!size || size <= 0) return "";
    const kb = size / 1024;
    if (kb < 1024) return kb.toFixed(1) + " Ko";
    const mb = kb / 1024;
    return mb.toFixed(1) + " Mo";
};

// Trigger the browser to save a Blob with the requested filename.
const triggerBrowserDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
};

// Shared data layer for DocumentsObjectPage (mobile + desktop). Owns the
// document list, download and the two-step upload pipeline (cf
// ~/docs/UPLOAD_PWA.md). The two views are pure render (cf .claude/CLAUDE.md
// viewport-aware pattern).
export const useDocumentsObjectData = () => {
    const { type, id } = useParams();
    const navigate = useNavigate();
    const dbDocs = useDbDocuments();
    const { alert } = useConfirm();

    const isValidType = ALLOWED_TYPES.has(type);
    const objectId = parseInt(id, 10) || 0;
    const typeLabel = TYPE_LABELS[type] ?? type;

    const { states, set } = useStates({
        documents: [],
        loading: false,
        error: null,
        downloadingShare: null,
        uploading: false,
        uploadError: null,
    });

    const { documents, loading, error, downloadingShare, uploading, uploadError } = states ?? {};

    const hasClient = !!dbDocs.list;

    useEffect(() => {
        if (!hasClient) return;
        if (!isValidType || objectId <= 0) {
            set("error", "Type ou identifiant d'objet invalide");
            return;
        }
        loadDocuments();
    }, [hasClient, type, objectId]);

    const loadDocuments = async () => {
        set("loading", true);
        set("error", null);
        try {
            const rows = await dbDocs.list({ objectType: type, objectId });
            set("documents", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbDocs.list error", err);
            if (err?.response?.status === 404) {
                set("error", "Objet introuvable");
            } else if (err?.response?.status === 403) {
                set("error", "Accès refusé sur cet objet");
            } else {
                set("error", "Erreur de chargement des documents");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/documents");

    const handleDownload = async (doc) => {
        if (!doc?.share) {
            await alert({
                type: "warning",
                title: "Téléchargement impossible",
                message: "Le document ne possède pas de hash de partage.",
            });
            return;
        }
        set("downloadingShare", doc.share);
        try {
            // Use the JSON (base64) endpoint: simpler than streaming the binary
            // through the ky client. The 50 MB cap on the server is acceptable
            // for documents browsed from the PWA.
            const { blob, filename } = await dbDocs.download({
                objectType: type,
                objectId,
                share: doc.share,
            });
            triggerBrowserDownload(blob, filename || doc.name);
        } catch (err) {
            console.error("dbDocs.download error", err);
            await alert({
                type: "warning",
                title: "Téléchargement impossible",
                message: "Erreur lors du téléchargement du document.",
            });
        } finally {
            set("downloadingShare", null);
        }
    };

    // The <input type="file"> change handler.
    //
    // Two-step pipeline (cf ~/docs/UPLOAD_PWA.md):
    //   1. POST /upload via SmartAuth's UploadController: stages the binary
    //      and returns an upload_id.
    //   2. POST /document/attach via Dolipocket's DocumentController: moves
    //      the staged file into the object's dir_output, registers it in
    //      llx_ecm_files and returns the freshly created share hash.
    // On success we re-fetch the document list so the new entry appears in
    // the UI. Failures are surfaced to the user via the alert dialog and the
    // hook itself takes care of cancelling the staged upload to avoid leaks.
    const handleFileSelected = async (event) => {
        const file = event?.target?.files?.[0];
        // Reset the input so picking the same file twice still triggers a change.
        if (event?.target) event.target.value = "";
        if (!file) return;

        set("uploading", true);
        set("uploadError", null);
        try {
            const attached = await dbDocs.upload({
                file,
                objectType: type,
                objectId,
                filename: file.name,
            });
            if (!attached?.attached) {
                throw new Error("dbDocs.upload did not confirm the attachment");
            }
            await alert({
                type: "success",
                title: "Document attaché",
                message: "Le document a été enregistré et lié à l'objet.",
            });
            await loadDocuments();
        } catch (err) {
            console.error("dbDocs.upload error", err);
            const status = err?.response?.status;
            let message = "Échec de l'attachement du document";
            if (status === 403) {
                message = "Accès refusé pour attacher un document à cet objet";
            } else if (status === 404) {
                message = "Objet introuvable ou téléversement expiré";
            } else if (status === 400) {
                message = "Données d'attachement invalides";
            }
            set("uploadError", message);
            await alert({
                type: "warning",
                title: "Téléversement impossible",
                message,
            });
        } finally {
            set("uploading", false);
        }
    };

    const triggerFilePicker = () => {
        const input = document.getElementById("documents-object-file-input");
        if (input) input.click();
    };

    return {
        type,
        objectId,
        isValidType,
        typeLabel,
        documents,
        loading,
        error,
        downloadingShare,
        uploading,
        uploadError,
        loadDocuments,
        handleBack,
        handleDownload,
        handleFileSelected,
        triggerFilePicker,
    };
};
