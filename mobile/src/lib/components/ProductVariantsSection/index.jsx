import { useEffect, useState, useCallback } from "react";
import { FaClone, FaArrowsRotate, FaPlus, FaXmark, FaTrash } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Variantes" section on the product detail desktop view -- Tier A lot A6a.
//
// Three sub-blocks:
//   1. Combinaisons : the variant combinations of this parent product (each one
//      is a child product). Delete removes the combination (the child product
//      stays, native REST behavior).
//   2. Creer une combinaison : pick one value per attribute, optional price /
//      weight variation, then create (auto-creates the child product).
//   3. Attributs : manage the GLOBAL attributes (Couleur, Taille, ...) and their
//      values. Refs are forced UPPERCASE server-side. Delete is blocked if used.
//
// Server side (cf .claude/CLAUDE.md "Tier A - A6a"): GET product/attributes,
// POST/PUT/DELETE product/attribute(/{id}), POST/DELETE product/attribute/{id}/value,
// GET/POST product/{id}/combinations, DELETE product/{id}/combination/{rowid}.
//
// Native HTML input/select are used (raw e.target.value is fine here -- these are
// NOT smartcommon components). Conventions UI desktop epurees: bg-white rounded-xl
// border, density tight, transition-colors. Hardcoded FR strings (no i18n).
//
// Props:
//   productId   number  Required. Parent product id.
//   dataSource  object  Required. useDbProducts() instance.
//   editable    bool    When false, only the read lists are shown (no forms).
//   className   string  Optional extra class.
const inputCls = "h-[30px] px-2 rounded border border-soft-border text-[12px] focus:border-primary outline-none";

export const ProductVariantsSection = ({ productId, dataSource, editable = false, className = "" }) => {
    const [attributes, setAttributes] = useState([]);
    const [combinations, setCombinations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState("");

    const [attrForm, setAttrForm] = useState({ ref: "", label: "" });
    const [valueForms, setValueForms] = useState({});
    const [comboSel, setComboSel] = useState({});
    const [comboPrice, setComboPrice] = useState("");
    const [comboWeight, setComboWeight] = useState("");
    const [comboPercent, setComboPercent] = useState(false);

    const hasClient = !!(dataSource && dataSource.listAttributes && dataSource.getCombinations);

    // Lookup maps to render combination pairs as readable labels.
    const attrById = {};
    const valueById = {};
    attributes.forEach((a) => {
        attrById[a.id] = a;
        (a.values || []).forEach((v) => { valueById[v.id] = v; });
    });

    const load = useCallback(async () => {
        if (!hasClient || !productId) return;
        setLoading(true);
        setError(null);
        try {
            const [attrs, combos] = await Promise.all([
                dataSource.listAttributes(),
                dataSource.getCombinations(productId),
            ]);
            setAttributes(Array.isArray(attrs) ? attrs : []);
            setCombinations(Array.isArray(combos) ? combos : []);
        } catch (err) {
            console.error("ProductVariantsSection.load error", err);
            setError("Erreur de chargement des variantes");
            setAttributes([]);
            setCombinations([]);
        } finally {
            setLoading(false);
        }
    }, [hasClient, productId]);

    useEffect(() => {
        load();
    }, [hasClient, productId]);

    // Generic error handler: 403 -> access-denied toast, else a specific message.
    const onError = (err, context, message) => {
        console.error(`ProductVariantsSection.${context} error`, err);
        const status = err?.response?.status ?? err?.status ?? null;
        if (status === 403) {
            notifyAccessDenied(err);
        } else {
            toast.error(message);
        }
    };

    const handleAddAttribute = async () => {
        if (!attrForm.ref.trim() || !attrForm.label.trim()) return;
        setBusy("attr-new");
        try {
            const fresh = await dataSource.addAttribute({ ref: attrForm.ref, label: attrForm.label });
            setAttributes(Array.isArray(fresh) ? fresh : []);
            setAttrForm({ ref: "", label: "" });
        } catch (err) {
            onError(err, "addAttribute", "Erreur lors de la création de l'attribut");
        } finally {
            setBusy("");
        }
    };

    const handleDeleteAttribute = async (attrId) => {
        setBusy(`attr-${attrId}`);
        try {
            const fresh = await dataSource.deleteAttribute(attrId);
            setAttributes(Array.isArray(fresh) ? fresh : []);
        } catch (err) {
            onError(err, "deleteAttribute", "Impossible de supprimer cet attribut (il est peut-être utilisé)");
        } finally {
            setBusy("");
        }
    };

    const handleAddValue = async (attrId) => {
        const form = valueForms[attrId] || { ref: "", value: "" };
        if (!form.ref.trim() || !form.value.trim()) return;
        setBusy(`val-new-${attrId}`);
        try {
            const fresh = await dataSource.addAttributeValue(attrId, { ref: form.ref, value: form.value });
            setAttributes(Array.isArray(fresh) ? fresh : []);
            setValueForms((f) => ({ ...f, [attrId]: { ref: "", value: "" } }));
        } catch (err) {
            onError(err, "addAttributeValue", "Erreur lors de la création de la valeur");
        } finally {
            setBusy("");
        }
    };

    const handleDeleteValue = async (attrId, valueId) => {
        setBusy(`val-${valueId}`);
        try {
            const fresh = await dataSource.deleteAttributeValue(attrId, valueId);
            setAttributes(Array.isArray(fresh) ? fresh : []);
        } catch (err) {
            onError(err, "deleteAttributeValue", "Impossible de supprimer cette valeur (elle est peut-être utilisée)");
        } finally {
            setBusy("");
        }
    };

    const handleCreateCombination = async () => {
        const pairs = Object.entries(comboSel)
            .filter(([, valueId]) => Number(valueId) > 0)
            .map(([attributeId, valueId]) => ({ attribute_id: Number(attributeId), value_id: Number(valueId) }));
        if (pairs.length === 0) {
            toast.error("Sélectionnez au moins une valeur d'attribut");
            return;
        }
        setBusy("combo-new");
        try {
            const fresh = await dataSource.addCombination(productId, {
                pairs,
                priceVariation: comboPrice,
                weightVariation: comboWeight,
                priceVariationPercent: comboPercent,
            });
            setCombinations(Array.isArray(fresh) ? fresh : []);
            setComboSel({});
            setComboPrice("");
            setComboWeight("");
            setComboPercent(false);
        } catch (err) {
            onError(err, "addCombination", "Erreur lors de la création de la combinaison");
        } finally {
            setBusy("");
        }
    };

    const handleRemoveCombination = async (rowid) => {
        setBusy(`combo-${rowid}`);
        try {
            const fresh = await dataSource.removeCombination(productId, rowid);
            setCombinations(Array.isArray(fresh) ? fresh : []);
        } catch (err) {
            onError(err, "removeCombination", "Erreur lors de la suppression de la combinaison");
        } finally {
            setBusy("");
        }
    };

    const pairLabel = (pair) => {
        const a = attrById[pair.attributeId];
        const v = valueById[pair.valueId];
        const aLabel = a ? (a.label || a.ref) : `#${pair.attributeId}`;
        const vLabel = v ? v.value : `#${pair.valueId}`;
        return `${aLabel}: ${vLabel}`;
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaClone className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Variantes</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({combinations.length})</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">{error}</div>
            )}

            {/* 1. Combinations */}
            <div className="px-4 py-3">
                <h3 className="text-[13px] font-semibold text-strong-text mb-2">Combinaisons</h3>
                {loading && combinations.length === 0 && (
                    <div className="py-2 text-[12px] text-soft-text">Chargement...</div>
                )}
                {!loading && combinations.length === 0 && (
                    <div className="py-2 text-[12px] text-soft-text italic">Aucune combinaison</div>
                )}
                {combinations.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {combinations.map((c) => (
                            <li key={c.id} className="flex items-center gap-2 py-1.5 hover:bg-medium-bg/50 transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text truncate">
                                        {(c.pairs || []).map(pairLabel).join(", ") || (c.childRef || `#${c.childId}`)}
                                    </div>
                                    <div className="text-[11px] text-soft-text truncate">
                                        {c.childRef || `#${c.childId}`}
                                        {Number(c.variationPrice) !== 0
                                            ? ` - prix ${c.variationPricePercentage ? `${c.variationPrice} %` : `${c.variationPrice} EUR`}`
                                            : ""}
                                        {Number(c.variationWeight) !== 0 ? ` - poids ${c.variationWeight}` : ""}
                                    </div>
                                </div>
                                {editable && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveCombination(c.id)}
                                        disabled={busy === `combo-${c.id}`}
                                        title="Supprimer la combinaison"
                                        className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 transition-colors shrink-0"
                                    >
                                        <FaTrash className="text-[10px]" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* 2. Create a combination */}
            {editable && (
                <div className="px-4 py-3 border-t border-soft-border">
                    <h3 className="text-[13px] font-semibold text-strong-text mb-2">Créer une combinaison</h3>
                    {attributes.length === 0 && (
                        <div className="text-[12px] text-soft-text italic">{"Créez d'abord au moins un attribut et ses valeurs."}</div>
                    )}
                    {attributes.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {attributes.map((a) => (
                                <div key={a.id} className="flex items-center gap-2">
                                    <span className="text-[12px] text-soft-text w-28 shrink-0 truncate">{a.label || a.ref}</span>
                                    <select
                                        className={`${inputCls} flex-1`}
                                        value={comboSel[a.id] ?? ""}
                                        onChange={(e) => setComboSel((s) => ({ ...s, [a.id]: e.target.value }))}
                                    >
                                        <option value="">(ignorer)</option>
                                        {(a.values || []).map((v) => (
                                            <option key={v.id} value={v.id}>{v.value}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Var. prix"
                                    className={`${inputCls} w-28`}
                                    value={comboPrice}
                                    onChange={(e) => setComboPrice(e.target.value)}
                                />
                                <label className="flex items-center gap-1 text-[12px] text-soft-text">
                                    <input type="checkbox" checked={comboPercent} onChange={(e) => setComboPercent(e.target.checked)} />
                                    {"%"}
                                </label>
                                <input
                                    type="number"
                                    step="0.001"
                                    placeholder="Var. poids"
                                    className={`${inputCls} w-28`}
                                    value={comboWeight}
                                    onChange={(e) => setComboWeight(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateCombination}
                                    disabled={busy === "combo-new"}
                                    className="h-[30px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                    <FaPlus className="text-[11px]" />
                                    <span>Créer</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 3. Global attributes */}
            <div className="px-4 py-3 border-t border-soft-border">
                <h3 className="text-[13px] font-semibold text-strong-text mb-2">Attributs</h3>
                {attributes.length === 0 && !loading && (
                    <div className="text-[12px] text-soft-text italic mb-2">Aucun attribut</div>
                )}
                <ul className="flex flex-col gap-3">
                    {attributes.map((a) => (
                        <li key={a.id} className="border border-soft-border rounded-md px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="text-[13px] font-medium text-strong-text">{a.label || a.ref}</span>
                                    <span className="text-[11px] text-soft-text ml-1">({a.ref})</span>
                                </div>
                                {editable && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteAttribute(a.id)}
                                        disabled={busy === `attr-${a.id}`}
                                        title="Supprimer l'attribut"
                                        className="h-[24px] px-1.5 rounded text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors shrink-0"
                                    >
                                        <FaTrash className="text-[10px]" />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {(a.values || []).map((v) => (
                                    <span key={v.id} className="inline-flex items-center gap-1 text-[11px] bg-medium-bg rounded px-1.5 py-0.5 text-strong-text">
                                        {v.value}
                                        {editable && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteValue(a.id, v.id)}
                                                disabled={busy === `val-${v.id}`}
                                                title="Supprimer la valeur"
                                                className="text-soft-text hover:text-red-600 disabled:opacity-40 transition-colors"
                                            >
                                                <FaXmark className="text-[10px]" />
                                            </button>
                                        )}
                                    </span>
                                ))}
                                {(a.values || []).length === 0 && (
                                    <span className="text-[11px] text-soft-text italic">Aucune valeur</span>
                                )}
                            </div>
                            {editable && (
                                <div className="flex items-center gap-2 mt-2">
                                    <input
                                        placeholder="Ref valeur"
                                        className={`${inputCls} w-24`}
                                        value={(valueForms[a.id]?.ref) ?? ""}
                                        onChange={(e) => setValueForms((f) => ({ ...f, [a.id]: { ...(f[a.id] || { ref: "", value: "" }), ref: e.target.value } }))}
                                    />
                                    <input
                                        placeholder="Valeur"
                                        className={`${inputCls} flex-1`}
                                        value={(valueForms[a.id]?.value) ?? ""}
                                        onChange={(e) => setValueForms((f) => ({ ...f, [a.id]: { ...(f[a.id] || { ref: "", value: "" }), value: e.target.value } }))}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddValue(a.id)}
                                        disabled={busy === `val-new-${a.id}`}
                                        className="h-[30px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                    >
                                        <FaPlus className="text-[10px]" />
                                        <span>Valeur</span>
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
                {editable && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-soft-border">
                        <input
                            placeholder="Ref attribut"
                            className={`${inputCls} w-28`}
                            value={attrForm.ref}
                            onChange={(e) => setAttrForm((f) => ({ ...f, ref: e.target.value }))}
                        />
                        <input
                            placeholder="Libellé (ex: Couleur)"
                            className={`${inputCls} flex-1`}
                            value={attrForm.label}
                            onChange={(e) => setAttrForm((f) => ({ ...f, label: e.target.value }))}
                        />
                        <button
                            type="button"
                            onClick={handleAddAttribute}
                            disabled={busy === "attr-new"}
                            className="h-[30px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            <FaPlus className="text-[11px]" />
                            <span>Attribut</span>
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
};
