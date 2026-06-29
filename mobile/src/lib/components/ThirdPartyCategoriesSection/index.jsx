import { useEffect, useState, useCallback } from "react";
import { FaTags, FaArrowsRotate, FaTrash, FaPlus } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Categories" section displayed on the third party detail desktop view.
// Mirrors the Dolibarr customer/supplier categories (tags): it lists the
// categories assigned to the thirdparty (with a small "Client"/"Fournisseur"
// type badge) and lets the user attach a new one from the available list, or
// remove an existing assignment.
//
// Server side: GET/POST/DELETE thirdparty/{id}/categor(y|ies) wired through
// the hook (useDbThirdParties). Each call returns { assigned, available } so
// the UI stays in sync without a manual reload.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max), separators via border-b
//   - hover:bg-medium-bg/50 on rows, transition-colors only.
//
// Props:
//   thirdpartyId number  Required. Dolibarr thirdparty id.
//   dataSource   object  Required. The useDbThirdParties() hook instance
//                        exposing listCategories / addCategory / removeCategory.
//   className    string  Optional extra class for the outer <section>.

const TYPE_LABELS = {
    customer: "Client",
    supplier: "Fournisseur",
};

const typeLabel = (type) => TYPE_LABELS[type] || type || "";

export const ThirdPartyCategoriesSection = ({ thirdpartyId, dataSource, className = "" }) => {
    const [assigned, setAssigned] = useState([]);
    const [available, setAvailable] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyCatId, setBusyCatId] = useState(0);
    const [adding, setAdding] = useState(false);
    // Encoded "<type>:<id>" so a single <select> covers both the customer and
    // supplier category lists.
    const [selected, setSelected] = useState("");

    const hasClient = !!(dataSource && dataSource.listCategories);

    const load = useCallback(async () => {
        if (!hasClient || !thirdpartyId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await dataSource.listCategories(thirdpartyId);
            setAssigned(Array.isArray(data?.assigned) ? data.assigned : []);
            setAvailable(Array.isArray(data?.available) ? data.available : []);
        } catch (err) {
            console.error("ThirdPartyCategoriesSection.load error", err);
            setError("Erreur de chargement des catégories");
            setAssigned([]);
            setAvailable([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, thirdpartyId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, thirdpartyId]);

    const applyPayload = (data) => {
        if (Array.isArray(data?.assigned)) setAssigned(data.assigned);
        if (Array.isArray(data?.available)) setAvailable(data.available);
    };

    const handleAdd = async () => {
        if (!selected) {
            toast.error("Sélectionnez une catégorie");
            return;
        }
        const sep = selected.indexOf(":");
        const type = selected.slice(0, sep);
        const categoryId = Number(selected.slice(sep + 1));
        setAdding(true);
        try {
            const data = await dataSource.addCategory(thirdpartyId, { categoryId, type });
            applyPayload(data);
            setSelected("");
            toast.success("Catégorie ajoutée");
        } catch (err) {
            console.error("ThirdPartyCategoriesSection.handleAdd error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de l'ajout de la catégorie");
            }
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (catId) => {
        setBusyCatId(catId);
        try {
            const data = await dataSource.removeCategory(thirdpartyId, catId);
            applyPayload(data);
        } catch (err) {
            console.error("ThirdPartyCategoriesSection.handleRemove error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du retrait de la catégorie");
            }
        } finally {
            setBusyCatId(0);
        }
    };

    const customerAvailable = available.filter((c) => c.type === "customer");
    const supplierAvailable = available.filter((c) => c.type === "supplier");

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaTags className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Catégories</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({assigned.length})</span>
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
                {loading && assigned.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && assigned.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucune catégorie liée
                    </div>
                )}

                {assigned.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {assigned.map((cat) => (
                            <li
                                key={`${cat.type}:${cat.id}`}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <span className="text-[13px] text-strong-text truncate">
                                        {cat.label || `#${cat.id}`}
                                    </span>
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                        {typeLabel(cat.type)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(cat.id)}
                                    disabled={busyCatId === cat.id}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                    title="Retirer cette catégorie"
                                >
                                    <FaTrash className="text-[10px]" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Add a category: type-grouped select + add button. */}
            <div className="border-t border-soft-border px-3 py-2.5 flex flex-col gap-2">
                <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="h-[30px] px-2 rounded border border-soft-border text-[12px] text-strong-text bg-white"
                >
                    <option value="">Catégorie...</option>
                    {customerAvailable.length > 0 && (
                        <optgroup label="Catégories client">
                            {customerAvailable.map((c) => (
                                <option key={`customer:${c.id}`} value={`customer:${c.id}`}>{c.label}</option>
                            ))}
                        </optgroup>
                    )}
                    {supplierAvailable.length > 0 && (
                        <optgroup label="Catégories fournisseur">
                            {supplierAvailable.map((c) => (
                                <option key={`supplier:${c.id}`} value={`supplier:${c.id}`}>{c.label}</option>
                            ))}
                        </optgroup>
                    )}
                </select>

                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={adding || !selected}
                    className="h-[30px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaPlus className="text-[11px]" />
                    <span>Ajouter</span>
                </button>
            </div>
        </section>
    );
};
