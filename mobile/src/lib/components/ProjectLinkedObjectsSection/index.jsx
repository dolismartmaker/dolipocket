import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaLink, FaArrowsRotate, FaTrash } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Referents / linked objects" section for the project detail desktop view
// (lot B2b). Mirrors the Dolibarr project "Referents" tab: lists every object
// attached to the project (devis, commandes, factures, docs fournisseur,
// evenements) grouped by type, with a link to open each and a detach action.
//
// Server side: GET project/{id}/elements (grouped) + DELETE
// project/{id}/element/{type}/{elementId} via useDbProjects. Linking is done
// automatically when an object is created from the project (no manual link in
// v1, matching Dolibarr where the fk_projet column is set at creation).
//
// Conventions UI desktop epurees (cf .claude/CLAUDE.md): border not shadow,
// tight density, transition-colors only.
//
// Props:
//   projectId  number  Required.
//   dataSource object  Required. useDbProjects() instance exposing
//                      listLinkedObjects / detachLinkedObject.
//   canWrite   bool    Optional. Show the detach button (default false).
//   className  string  Optional extra class for the outer <section>.
export const ProjectLinkedObjectsSection = ({ projectId, dataSource, canWrite = false, className = "" }) => {
    const navigate = useNavigate();
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyKey, setBusyKey] = useState("");

    const hasClient = !!(dataSource && dataSource.listLinkedObjects);

    const load = useCallback(async () => {
        if (!hasClient || !projectId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await dataSource.listLinkedObjects(projectId);
            setGroups(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("ProjectLinkedObjectsSection.load error", err);
            setError("Erreur de chargement des objets liés");
            setGroups([]);
        } finally {
            setLoading(false);
        }
    }, [hasClient, projectId, dataSource]);

    useEffect(() => {
        load();
    }, [hasClient, projectId, load]);

    const handleDetach = async (type, elementId) => {
        const key = `${type}:${elementId}`;
        setBusyKey(key);
        try {
            const data = await dataSource.detachLinkedObject(projectId, type, elementId);
            setGroups(Array.isArray(data) ? data : []);
            toast.success("Objet détaché du projet");
        } catch (err) {
            console.error("ProjectLinkedObjectsSection.handleDetach error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du détachement");
            }
        } finally {
            setBusyKey("");
        }
    };

    const nonEmpty = groups.filter((g) => (g.items?.length ?? 0) > 0);

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaLink className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Objets liés</h2>
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
                {loading && nonEmpty.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">Chargement...</div>
                )}
                {!loading && nonEmpty.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">Aucun objet lié</div>
                )}
                {nonEmpty.map((g) => (
                    <div key={g.type} className="py-1">
                        <div className="px-2 py-1 text-[11px] font-semibold text-soft-text uppercase tracking-wide">
                            {g.label} ({g.count})
                        </div>
                        <ul className="divide-y divide-soft-border/60">
                            {g.items.map((it) => (
                                <li
                                    key={`${g.type}:${it.id}`}
                                    className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                                >
                                    <button
                                        type="button"
                                        onClick={() => it.route && navigate(it.route)}
                                        className="flex-1 min-w-0 text-left text-[13px] text-primary hover:underline truncate"
                                    >
                                        {it.ref || `#${it.id}`}
                                    </button>
                                    {canWrite && (
                                        <button
                                            type="button"
                                            onClick={() => handleDetach(g.type, it.id)}
                                            disabled={busyKey === `${g.type}:${it.id}`}
                                            className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                            title="Détacher du projet"
                                        >
                                            <FaTrash className="text-[10px]" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
};
