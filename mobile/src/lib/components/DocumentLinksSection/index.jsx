import { useEffect, useState, useCallback } from "react";
import { FaLink, FaArrowsRotate, FaLinkSlash } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Objets liés" section displayed under the contacts on the five document
// detail desktop views (Proposal / Order / Invoice / SupplierOrder /
// SupplierInvoice). Mirrors the Dolibarr "Linked objects" box: it shows the
// related documents (the order an invoice was created from, the proposal a
// commande originates from, ...) and lets the user remove a link.
//
// Server side: GET <feature>/{id}/links + DELETE <feature>/{id}/link/{rowid}
// wired through the shared DocumentLinkTrait. Linking is created automatically
// by the createFrom* workflow, so this section is read + unlink only.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight, separators via border-b, transition-colors only.
//
// Props:
//   docId       number  Required. Dolibarr document id.
//   dataSource  object  Required. The useDb<Feature>() hook instance exposing
//                       listLinks / removeLink.
//   className   string  Optional extra class for the outer <section>.
export const DocumentLinksSection = ({ docId, dataSource, className = "" }) => {
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyRowid, setBusyRowid] = useState(0);

    const hasClient = !!(dataSource && dataSource.listLinks);

    const load = useCallback(async () => {
        if (!hasClient || !docId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await dataSource.listLinks(docId);
            setLinks(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("DocumentLinksSection.load error", err);
            setError("Erreur de chargement des objets liés");
            setLinks([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, docId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, docId]);

    const handleRemove = async (rowid) => {
        if (!rowid) return;
        setBusyRowid(rowid);
        try {
            const data = await dataSource.removeLink(docId, rowid);
            setLinks(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("DocumentLinksSection.handleRemove error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du retrait du lien");
            }
        } finally {
            setBusyRowid(0);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaLink className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Objets liés</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({links.length})</span>
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
                {loading && links.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && links.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucun objet lié
                    </div>
                )}

                {links.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {links.map((lnk, idx) => (
                            <li
                                key={lnk.rowid || `${lnk.type}-${lnk.id}-${idx}`}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text truncate">
                                        {lnk.ref || `#${lnk.id}`}
                                    </div>
                                    <div className="text-[11px] text-soft-text truncate">
                                        {lnk.label}
                                    </div>
                                </div>
                                {lnk.rowid > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(lnk.rowid)}
                                        disabled={busyRowid === lnk.rowid}
                                        className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                        title="Retirer ce lien"
                                    >
                                        <FaLinkSlash className="text-[10px]" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};
