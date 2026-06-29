import { useEffect, useState, useCallback } from "react";
import {
    FaFileLines, FaFilePdf, FaFileImage, FaFileWord, FaFileExcel,
    FaFileZipper, FaFile, FaDownload, FaArrowsRotate,
} from "react-icons/fa6";
import toast from "react-hot-toast";

import { useDbDocuments } from "src/db/stores/documents/useDbDocuments";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";
import {
    downloadBlob, filenameFromContentDisposition,
} from "src/lib/utils/downloadBlob";

// "Documents" section displayed under the <DocumentLinesEditor> on the five
// document PageDetail desktop views (Proposal / Order / Invoice /
// SupplierOrder / SupplierInvoice). Calls the Dolipocket-native
// GET /document?objectType=<t>&objectId=<n> endpoint via
// useDbDocuments.listForObject() and exposes a "Télécharger" button per row
// that pipes the binary through useDbDocuments.downloadFile().
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max)
//   - separators via border-b, never shadow
//   - hover:bg-medium-bg/50 on rows, no transition-all
//
// Props:
//   objectType  string  Required. Dolipocket object type identifier
//                       ("proposal", "order", "invoice", "supplier_order",
//                       "supplier_invoice", ...). MUST match a key from
//                       DocumentController::$objectTypeMap server-side.
//   objectId    number  Required. Dolibarr object id.
//   className   string  Optional extra class for the outer <section>.
//
// Refresh: parent components may pass a `refreshKey` prop (any primitive
// changed value) to force a reload -- useful after generatePdf so the new
// PDF shows up immediately.
export const DocumentsSection = ({
    objectType,
    objectId,
    className = "",
    refreshKey,
}) => {
    const dbDocuments = useDbDocuments();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyEcmId, setBusyEcmId] = useState(0);

    // Memoise the loader so the effect deps stay stable.
    const load = useCallback(async () => {
        if (!objectType || !objectId) {
            setItems([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const docs = await dbDocuments.listForObject({ objectType, objectId });
            setItems(Array.isArray(docs) ? docs : []);
        } catch (err) {
            console.error("DocumentsSection.load error", err);
            setError("Erreur de chargement des documents");
            setItems([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectType, objectId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectType, objectId, refreshKey]);

    const handleDownload = async (doc) => {
        if (!doc || !doc.ecmId) {
            toast.error("Document non indexé, téléchargement indisponible");
            return;
        }
        setBusyEcmId(doc.ecmId);
        try {
            const { blob, contentDisposition } = await dbDocuments.downloadFile(doc.ecmId);
            const filename = filenameFromContentDisposition(
                contentDisposition,
                doc.filename || "document.bin",
            );
            downloadBlob(blob, filename);
        } catch (err) {
            console.error("DocumentsSection.handleDownload error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 404) {
                toast.error("Document introuvable.");
            } else if (status === 410) {
                toast.error("Le fichier n'existe plus sur le serveur.");
            } else if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du téléchargement");
            }
        } finally {
            setBusyEcmId(0);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaFileLines className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">
                        Documents
                    </h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">
                            ({items.length})
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser la liste"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">
                    {error}
                </div>
            )}

            <div className="px-2 py-1">
                {loading && items.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && items.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucun document
                    </div>
                )}

                {items.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {items.map((doc, idx) => (
                            <li
                                key={`${doc.ecmId || idx}-${doc.filename}`}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <FileIcon mime={doc.mime} className="shrink-0 text-soft-text text-base" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text truncate" title={doc.filename}>
                                        {doc.filename}
                                    </div>
                                    <div className="text-[11px] text-soft-text">
                                        {humanSize(doc.size)}
                                        {doc.dateModification > 0 && (
                                            <> · {formatDate(doc.dateModification)}</>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDownload(doc)}
                                    disabled={busyEcmId === doc.ecmId || !doc.ecmId}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                    title={
                                        doc.ecmId
                                            ? "Télécharger"
                                            : "Document non indexé (regénérer le PDF pour télécharger)"
                                    }
                                >
                                    <FaDownload className="text-[10px]" />
                                    <span>Télécharger</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

// Resolve a small file-type icon from the MIME hint exposed by the backend.
const FileIcon = ({ mime, className = "" }) => {
    const m = String(mime || "").toLowerCase();
    if (m.includes("pdf")) return <FaFilePdf className={className} />;
    if (m.startsWith("image/")) return <FaFileImage className={className} />;
    if (m.includes("word") || m.includes("opendocument.text")) return <FaFileWord className={className} />;
    if (m.includes("excel") || m.includes("spreadsheet")) return <FaFileExcel className={className} />;
    if (m.includes("zip") || m.includes("compress")) return <FaFileZipper className={className} />;
    return <FaFile className={className} />;
};

// Human-readable byte size: 1024 -> "1 Ko", 5_000_000 -> "4.8 Mo", etc.
const humanSize = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "-";
    const units = ["o", "Ko", "Mo", "Go"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    const formatted = i === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
    return `${formatted} ${units[i]}`;
};

// Format a Unix epoch (seconds) as a French short datetime.
const formatDate = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    const d = new Date(n * 1000);
    return d.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
};
