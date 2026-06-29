import { useEffect, useState, useCallback } from "react";
import { FaArrowsRotate, FaWarehouse, FaTruck, FaTag, FaTrash, FaPlus, FaFloppyDisk } from "react-icons/fa6";
import toast from "react-hot-toast";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

// "Informations produit" section displayed on the product detail view. It
// aggregates three Dolibarr product sub-resources, all fetched in parallel at
// mount:
//   1. Stock par entrepôt        GET product/{id}/stock     -> { stockReel, warehouses }
//   2. Prix d'achat fournisseurs GET product/{id}/suppliers -> { suppliers }
//   3. Niveaux de prix           GET product/{id}/prices    -> { multiEnabled, ... }
//
// Tier A lot A4: when `editable` is true, write forms appear under the price
// and supplier blocks (set selling price / multiprice level, add or remove a
// supplier purchase price). Read-only otherwise (default), so existing callers
// are unaffected.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - one bg-white rounded-xl border border-soft-border section (no shadow)
//   - sub-blocks separated by border-t, never nested cards (no double border)
//   - density tight, hover:bg-medium-bg/50 on rows, transition-colors only.
//
// Props:
//   productId   number  Required. Dolibarr product id.
//   dataSource  object  Required. The useDbProducts() instance exposing
//                       getStock / getSuppliers / getPrices and (editable)
//                       setPrice / setSupplierPrice / deleteSupplierPrice.
//   editable    bool    Optional. Show the write forms (default false).
//   className   string  Optional extra class for the outer <section>.

const fmtAmount = (v) =>
    Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputCls = "h-[30px] px-2 rounded border border-soft-border text-[12px] focus:border-primary focus:outline-none";

export const ProductExtrasSection = ({ productId, dataSource, editable = false, className = "" }) => {
    const [stock, setStock] = useState({ stockReel: 0, warehouses: [] });
    const [suppliers, setSuppliers] = useState([]);
    const [prices, setPrices] = useState({ multiEnabled: false, levels: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    // Supplier dropdown options (only needed in editable mode).
    const dbThirdParties = useDbThirdParties();
    const [supplierOptions, setSupplierOptions] = useState([]);

    // Write form state.
    const [priceForm, setPriceForm] = useState({ level: "1", price: "", priceBaseType: "HT", vatTx: "", minPrice: "" });
    const [supplierForm, setSupplierForm] = useState({ supplierId: "", refSupplier: "", qty: "1", buyPrice: "", priceBaseType: "HT", vatTx: "" });

    const hasClient = !!(dataSource && dataSource.getStock);

    const load = useCallback(async () => {
        if (!hasClient || !productId) return;
        setLoading(true);
        setError(null);
        try {
            const [stockData, suppliersData, pricesData] = await Promise.all([
                dataSource.getStock(productId),
                dataSource.getSuppliers(productId),
                dataSource.getPrices(productId),
            ]);
            setStock(
                stockData && typeof stockData === "object"
                    ? stockData
                    : { stockReel: 0, warehouses: [] },
            );
            setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
            setPrices(
                pricesData && typeof pricesData === "object"
                    ? pricesData
                    : { multiEnabled: false, levels: [] },
            );
        } catch (err) {
            console.error("ProductExtrasSection.load error", err);
            setError("Erreur de chargement des informations produit");
            setStock({ stockReel: 0, warehouses: [] });
            setSuppliers([]);
            setPrices({ multiEnabled: false, levels: [] });
        } finally {
            setLoading(false);
        }
    }, [hasClient, productId]);

    useEffect(() => {
        load();
    }, [hasClient, productId]);

    // Load supplier options once when editing is enabled.
    useEffect(() => {
        if (!editable || !dbThirdParties.list) return;
        let cancelled = false;
        dbThirdParties
            .list({ perPage: 1000 })
            .then((rows) => {
                if (cancelled) return;
                const all = Array.isArray(rows) ? rows : [];
                const onlySuppliers = all.filter((t) => Number(t.fournisseur) > 0);
                setSupplierOptions(onlySuppliers.length > 0 ? onlySuppliers : all);
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
        // Intentionally only re-run when `editable` flips: dbThirdParties is an
        // unstable hook reference (would loop) -- cf .claude/CLAUDE.md deps rule.
    }, [editable]);

    const warehouses = Array.isArray(stock?.warehouses) ? stock.warehouses : [];
    const levels = Array.isArray(prices?.levels) ? prices.levels : [];
    const hasLevels = !!prices?.multiEnabled && levels.length > 0;

    const handleSavePrice = async () => {
        if (priceForm.price === "" || !Number.isFinite(Number(priceForm.price))) {
            toast.error("Renseignez un prix valide");
            return;
        }
        setBusy(true);
        try {
            const updated = await dataSource.setPrice(productId, {
                price: Number(priceForm.price),
                priceBaseType: priceForm.priceBaseType,
                vatTx: priceForm.vatTx === "" ? 0 : Number(priceForm.vatTx),
                level: prices?.multiEnabled ? Number(priceForm.level) : 1,
                minPrice: priceForm.minPrice === "" ? 0 : Number(priceForm.minPrice),
            });
            if (updated && typeof updated === "object") setPrices(updated);
            else await load();
            setPriceForm((f) => ({ ...f, price: "", minPrice: "" }));
            toast.success("Prix mis à jour");
        } catch (err) {
            console.error("setPrice", err);
            toast.error("Mise à jour du prix impossible");
        } finally {
            setBusy(false);
        }
    };

    const handleAddSupplierPrice = async () => {
        if (!supplierForm.supplierId || Number(supplierForm.supplierId) <= 0) {
            toast.error("Sélectionnez un fournisseur");
            return;
        }
        if (supplierForm.refSupplier.trim() === "") {
            toast.error("Renseignez la référence fournisseur");
            return;
        }
        if (supplierForm.buyPrice === "" || !Number.isFinite(Number(supplierForm.buyPrice))) {
            toast.error("Renseignez un prix d'achat valide");
            return;
        }
        setBusy(true);
        try {
            const list = await dataSource.setSupplierPrice(productId, {
                supplierId: Number(supplierForm.supplierId),
                refSupplier: supplierForm.refSupplier.trim(),
                qty: supplierForm.qty === "" ? 1 : Number(supplierForm.qty),
                buyPrice: Number(supplierForm.buyPrice),
                priceBaseType: supplierForm.priceBaseType,
                vatTx: supplierForm.vatTx === "" ? 0 : Number(supplierForm.vatTx),
            });
            setSuppliers(Array.isArray(list) ? list : []);
            setSupplierForm((f) => ({ ...f, refSupplier: "", buyPrice: "" }));
            toast.success("Prix fournisseur enregistré");
        } catch (err) {
            console.error("setSupplierPrice", err);
            toast.error("Enregistrement du prix fournisseur impossible");
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteSupplierPrice = async (rowid) => {
        setBusy(true);
        try {
            const list = await dataSource.deleteSupplierPrice(productId, rowid);
            setSuppliers(Array.isArray(list) ? list : []);
            toast.success("Prix fournisseur supprimé");
        } catch (err) {
            console.error("deleteSupplierPrice", err);
            toast.error("Suppression impossible");
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <h2 className="text-sm font-semibold text-strong-text">Informations produit</h2>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser les informations produit"
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

            {/* Sub-block 1: stock by warehouse */}
            <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <FaWarehouse className="text-soft-text text-sm" />
                    <h3 className="text-[13px] font-semibold text-strong-text">Stock par entrepôt</h3>
                </div>
                {warehouses.length === 0 ? (
                    <div className="text-[12px] text-soft-text py-1">Aucun stock</div>
                ) : (
                    <ul className="divide-y divide-soft-border/60">
                        {warehouses.map((w) => (
                            <li
                                key={w.warehouseId}
                                className="flex items-center justify-between gap-2 py-1.5 hover:bg-medium-bg/50 transition-colors"
                            >
                                <span className="text-[13px] text-strong-text truncate">
                                    {w.label || `#${w.warehouseId}`}
                                </span>
                                <span className="text-[13px] text-strong-text shrink-0">
                                    {Number(w.real ?? 0)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-soft-border/60">
                    <span className="text-[13px] font-semibold text-strong-text">Stock total</span>
                    <span className="text-[13px] font-bold text-strong-text">
                        {Number(stock?.stockReel ?? 0)}
                    </span>
                </div>
            </div>

            {/* Sub-block 2: supplier purchase prices */}
            <div className="border-t border-soft-border px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <FaTruck className="text-soft-text text-sm" />
                    <h3 className="text-[13px] font-semibold text-strong-text">Prix d&apos;achat fournisseurs</h3>
                </div>
                {suppliers.length === 0 ? (
                    <div className="text-[12px] text-soft-text py-1">Aucun prix fournisseur</div>
                ) : (
                    <ul className="divide-y divide-soft-border/60">
                        {suppliers.map((s) => (
                            <li
                                key={s.id}
                                className="flex items-center justify-between gap-3 py-1.5 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-strong-text truncate">
                                        {s.supplierName || `#${s.supplierId}`}
                                    </div>
                                    {s.ref && (
                                        <div className="text-[11px] text-soft-text truncate">{s.ref}</div>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className="text-[13px] text-strong-text">{fmtAmount(s.price)} EUR</div>
                                    <div className="text-[11px] text-soft-text">Qté {Number(s.qty ?? 0)}</div>
                                </div>
                                {editable && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteSupplierPrice(s.id)}
                                        disabled={busy}
                                        className="shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                                        aria-label="Supprimer ce prix fournisseur"
                                        title="Supprimer"
                                    >
                                        <FaTrash className="text-[11px]" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {editable && (
                    <div className="mt-3 pt-3 border-t border-soft-border/60 flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                value={supplierForm.supplierId}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, supplierId: e.target.value }))}
                                className={`${inputCls} col-span-2`}
                            >
                                <option value="">-- Fournisseur --</option>
                                {supplierOptions.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name || `#${s.id}`}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                placeholder="Réf. fournisseur"
                                value={supplierForm.refSupplier}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, refSupplier: e.target.value }))}
                                className={`${inputCls} col-span-2`}
                            />
                            <input
                                type="number" step="any" min="0" placeholder="Qté"
                                value={supplierForm.qty}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, qty: e.target.value }))}
                                className={inputCls}
                            />
                            <input
                                type="number" step="any" placeholder="Prix d'achat"
                                value={supplierForm.buyPrice}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, buyPrice: e.target.value }))}
                                className={inputCls}
                            />
                            <select
                                value={supplierForm.priceBaseType}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, priceBaseType: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="HT">HT</option>
                                <option value="TTC">TTC</option>
                            </select>
                            <input
                                type="number" step="any" min="0" placeholder="TVA %"
                                value={supplierForm.vatTx}
                                onChange={(e) => setSupplierForm((f) => ({ ...f, vatTx: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleAddSupplierPrice}
                            disabled={busy}
                            className="h-[30px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                        >
                            <FaPlus className="text-[11px]" />
                            <span>Ajouter un prix fournisseur</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Sub-block 3: price levels (multiprix) or base price */}
            <div className="border-t border-soft-border px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                    <FaTag className="text-soft-text text-sm" />
                    <h3 className="text-[13px] font-semibold text-strong-text">Niveaux de prix</h3>
                </div>
                {hasLevels ? (
                    <ul className="divide-y divide-soft-border/60">
                        {levels.map((lvl) => (
                            <li
                                key={lvl.level}
                                className="flex items-center justify-between gap-2 py-1.5 hover:bg-medium-bg/50 transition-colors"
                            >
                                <span className="text-[13px] text-strong-text">Niveau {lvl.level}</span>
                                <span className="text-[13px] text-strong-text shrink-0">
                                    {fmtAmount(lvl.priceHt)} EUR HT
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col gap-0.5 py-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-soft-text">Prix HT</span>
                            <span className="text-[13px] text-strong-text">{fmtAmount(prices?.priceHt)} EUR HT</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-soft-text">Prix TTC</span>
                            <span className="text-[13px] text-strong-text">{fmtAmount(prices?.priceTtc)} EUR TTC</span>
                        </div>
                    </div>
                )}

                {editable && (
                    <div className="mt-3 pt-3 border-t border-soft-border/60 flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            {prices?.multiEnabled && (
                                <select
                                    value={priceForm.level}
                                    onChange={(e) => setPriceForm((f) => ({ ...f, level: e.target.value }))}
                                    className={`${inputCls} col-span-2`}
                                >
                                    {Array.from({ length: 5 }, (_, i) => i + 1).map((lvl) => (
                                        <option key={lvl} value={lvl}>Niveau {lvl}</option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="number" step="any" placeholder="Prix"
                                value={priceForm.price}
                                onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))}
                                className={inputCls}
                            />
                            <select
                                value={priceForm.priceBaseType}
                                onChange={(e) => setPriceForm((f) => ({ ...f, priceBaseType: e.target.value }))}
                                className={inputCls}
                            >
                                <option value="HT">HT</option>
                                <option value="TTC">TTC</option>
                            </select>
                            <input
                                type="number" step="any" min="0" placeholder="TVA %"
                                value={priceForm.vatTx}
                                onChange={(e) => setPriceForm((f) => ({ ...f, vatTx: e.target.value }))}
                                className={inputCls}
                            />
                            <input
                                type="number" step="any" min="0" placeholder="Prix min."
                                value={priceForm.minPrice}
                                onChange={(e) => setPriceForm((f) => ({ ...f, minPrice: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleSavePrice}
                            disabled={busy}
                            className="h-[30px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                        >
                            <FaFloppyDisk className="text-[11px]" />
                            <span>Enregistrer le prix</span>
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
};
