import { FaArrowLeft, FaFileAlt, FaDownload, FaUpload } from "react-icons/fa";

import { Page } from "@cap-rel/smartcommon";

import { pickIcon, formatSize } from "./useDocumentsObjectData";

// Mobile per-object documents view: gradient header, list of document cards,
// fixed bottom upload bar. Presentational only -- state + handlers come from
// useDocumentsObjectData() (cf .claude/CLAUDE.md viewport-aware pattern).
export const DocumentsObjectPageMobile = (props) => {
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
        handleBack,
        handleDownload,
        handleFileSelected,
        triggerFilePicker,
    } = props;

    if (!isValidType || objectId <= 0) {
        return (
            <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
                <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                            <FaArrowLeft />
                        </button>
                        <h1 className="text-lg font-bold">Documents</h1>
                    </div>
                </div>
                <div className="p-4">
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                        {"Type ou identifiant d'objet invalide."}
                    </div>
                </div>
            </Page>
        );
    }

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">
                            {typeLabel} #{objectId}
                        </h1>
                        <p className="text-sm text-white/80">Documents attachés</p>
                    </div>
                </div>
            </div>

            <div className="p-4 pb-32 space-y-3">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                        {error}
                        <button onClick={loadDocuments} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {uploadError && (
                    <div className="p-3 bg-amber-100 text-amber-800 rounded-lg">
                        {uploadError}
                    </div>
                )}

                {loading && (documents?.length ?? 0) === 0 && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {!loading && (documents?.length ?? 0) === 0 && !error && (
                    <div className="text-center text-gray-500 py-12">
                        <FaFileAlt className="mx-auto text-4xl mb-3 text-gray-300" />
                        <div>Aucun document</div>
                    </div>
                )}

                <ul className="flex flex-col gap-2">
                    {documents?.map((doc) => {
                        const Icon = pickIcon(doc.mime);
                        const downloading = downloadingShare === doc.share;
                        return (
                            <li key={doc.id || doc.share || doc.relativePath}>
                                <div className="bg-white p-3 rounded-xl border border-gray-200 flex items-start gap-3">
                                    <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
                                        <Icon />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-800 truncate">
                                            {doc.name}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {doc.mime ?? "?"}
                                            {doc.size ? " - " + formatSize(doc.size) : ""}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDownload(doc)}
                                        disabled={downloading || !doc.share}
                                        className="px-3 py-2 bg-primary/10 text-primary rounded-lg flex items-center gap-1 disabled:opacity-50"
                                        aria-label="Télécharger"
                                    >
                                        <FaDownload />
                                        <span className="text-sm hidden sm:inline">
                                            {downloading ? "..." : "Télécharger"}
                                        </span>
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Hidden file input for upload */}
            <input
                id="documents-object-file-input"
                type="file"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />

            {/* Upload action bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-10">
                <button
                    type="button"
                    onClick={triggerFilePicker}
                    disabled={uploading}
                    className="w-full py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                >
                    <FaUpload className={uploading ? "animate-pulse" : ""} />
                    {uploading ? "Téléversement..." : "Téléverser un document"}
                </button>
            </div>
        </Page>
    );
};

export default DocumentsObjectPageMobile;
