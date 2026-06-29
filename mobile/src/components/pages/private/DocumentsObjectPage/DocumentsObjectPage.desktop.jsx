import { FaFileAlt, FaDownload, FaUpload } from "react-icons/fa";

import { pickIcon, formatSize } from "./useDocumentsObjectData";

// Desktop per-object documents view. Plain flex container filling the AppShell
// <main> (no <Page> grid). Sticky toolbar with the upload button, then a dense
// table. Épuré UI conventions: borders not shadows (cf .claude/CLAUDE.md).
export const DocumentsObjectPageDesktop = (props) => {
    const {
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
        handleDownload,
        handleFileSelected,
        triggerFilePicker,
    } = props;

    if (!isValidType || objectId <= 0) {
        return (
            <div className="flex flex-col h-full w-full bg-white overflow-hidden">
                <div className="shrink-0 px-4 py-2 border-b border-soft-border">
                    <h1 className="text-base font-bold text-strong-text">Documents</h1>
                </div>
                <div className="p-4">
                    <div className="px-4 py-2 bg-red-100 text-red-700 rounded text-[13px]">
                        {"Type ou identifiant d'objet invalide."}
                    </div>
                </div>
            </div>
        );
    }

    const rows = documents ?? [];

    return (
        <div className="flex flex-col h-full w-full bg-white overflow-hidden">
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <h1 className="text-base font-bold text-strong-text whitespace-nowrap">
                    {typeLabel} #{objectId}
                    <span className="ml-1 font-normal text-gray-500">- Documents ({rows.length})</span>
                </h1>

                <button
                    type="button"
                    onClick={triggerFilePicker}
                    disabled={uploading}
                    className="ml-auto h-[32px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaUpload className={`text-[11px] ${uploading ? "animate-pulse" : ""}`} />
                    <span>{uploading ? "Téléversement..." : "Téléverser"}</span>
                </button>

                {/* Hidden file input for upload */}
                <input
                    id="documents-object-file-input"
                    type="file"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                />
            </div>

            {error && (
                <div className="shrink-0 px-4 py-2 bg-red-100 text-red-700 text-[13px] border-b border-red-200">
                    {error}
                    <button onClick={loadDocuments} className="ml-2 underline">Réessayer</button>
                </div>
            )}

            {uploadError && (
                <div className="shrink-0 px-4 py-2 bg-amber-100 text-amber-800 text-[13px] border-b border-amber-200">
                    {uploadError}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
                {loading && rows.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-[13px]">Chargement...</div>
                ) : rows.length === 0 && !error ? (
                    <div className="py-16 text-center text-gray-500 text-[13px]">
                        <FaFileAlt className="mx-auto text-4xl mb-3 text-gray-300" />
                        <div>Aucun document</div>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-[13px]">
                        <thead className="sticky top-0 z-10 bg-medium-bg/60">
                            <tr className="text-left text-soft-text">
                                <th className="font-medium px-4 py-2">Nom</th>
                                <th className="font-medium px-4 py-2 w-48">Type</th>
                                <th className="font-medium px-4 py-2 w-28 text-right">Taille</th>
                                <th className="font-medium px-4 py-2 w-32 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((doc) => {
                                const Icon = pickIcon(doc.mime);
                                const downloading = downloadingShare === doc.share;
                                return (
                                    <tr
                                        key={doc.id || doc.share || doc.relativePath}
                                        className="border-b border-soft-border/60 hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-4 py-1.5 text-strong-text truncate max-w-0">
                                            <span className="flex items-center gap-2 min-w-0">
                                                <Icon className="text-primary shrink-0" />
                                                <span className="truncate">{doc.name}</span>
                                            </span>
                                        </td>
                                        <td className="px-4 py-1.5 text-soft-text truncate max-w-0">
                                            <span className="block truncate">{doc.mime ?? "?"}</span>
                                        </td>
                                        <td className="px-4 py-1.5 text-right text-soft-text tabular-nums whitespace-nowrap">
                                            {doc.size ? formatSize(doc.size) : ""}
                                        </td>
                                        <td className="px-4 py-1.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDownload(doc)}
                                                disabled={downloading || !doc.share}
                                                className="h-[28px] px-2.5 rounded text-[12px] inline-flex items-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                                            >
                                                <FaDownload className="text-[11px]" />
                                                <span>{downloading ? "..." : "Télécharger"}</span>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DocumentsObjectPageDesktop;
