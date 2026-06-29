import { FaArrowLeft, FaBoxesPacking } from "react-icons/fa6";

import { useReceptionCreateData } from "./useReceptionCreateData";

// "Create reception from supplier order" page (route
// /supplier-orders/:id/reception). Single responsive form: pick a warehouse +
// quantity per ordered product line, then POST it. Reached from the supplier
// order detail page when the order is ordered / partially received.
export const ReceptionCreatePage = () => {
    const {
        order, warehouses, lines, loading, error, submitting,
        dateDelivery, trackingNumber,
        set, setLineQty, setLineWarehouse, goBack, submit,
    } = useReceptionCreateData();

    const inputCls = "h-[32px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none";

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour à la commande fournisseur"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text">
                    Nouvelle réception{order?.ref ? ` - Commande ${order.ref}` : ""}
                </h1>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || loading || (lines?.length ?? 0) === 0}
                    className="h-[30px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaBoxesPacking className="text-[11px]" />
                    <span>{"Créer la réception"}</span>
                </button>
            </header>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {loading && <div className="text-soft-text text-sm">Chargement...</div>}
                {error && (
                    <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-2 text-[13px]">
                        {error}
                    </div>
                )}

                {!loading && !error && (lines?.length ?? 0) === 0 && (
                    <div className="bg-white rounded-xl border border-soft-border px-4 py-6 text-center text-soft-text text-[13px]">
                        Aucune ligne produit réceptionnable sur cette commande.
                    </div>
                )}

                {!loading && !error && (lines?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-4 max-w-4xl">
                        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                            <header className="px-4 py-2.5 border-b border-soft-border">
                                <h2 className="text-sm font-semibold text-strong-text">Lignes à recevoir</h2>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="text-left text-soft-text border-b border-soft-border">
                                            <th className="font-medium px-3 py-2">Produit</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">Qté commandée</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">Qté à recevoir</th>
                                            <th className="font-medium px-3 py-2 w-56">Entrepôt</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((l, idx) => (
                                            <tr key={l.fkCommandefourndet ?? idx} className="border-b border-soft-border/60">
                                                <td className="px-3 py-2 text-strong-text">{l.label}</td>
                                                <td className="px-3 py-2 text-right text-soft-text">{l.qtyOrdered}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={l.qty}
                                                        onChange={(e) => setLineQty(idx, e.target.value)}
                                                        className={`${inputCls} w-24 text-right`}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <select
                                                        value={l.entrepotId || ""}
                                                        onChange={(e) => setLineWarehouse(idx, e.target.value)}
                                                        className={`${inputCls} w-full`}
                                                    >
                                                        <option value="">-- Entrepôt --</option>
                                                        {(warehouses ?? []).map((w) => (
                                                            <option key={w.id} value={w.id}>{w.label || w.ref || `#${w.id}`}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="bg-white rounded-xl border border-soft-border overflow-hidden max-w-md">
                            <header className="px-4 py-2.5 border-b border-soft-border">
                                <h2 className="text-sm font-semibold text-strong-text">{"Détails de la réception"}</h2>
                            </header>
                            <div className="px-4 py-3 flex flex-col gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[12px] text-soft-text">Date de livraison prévue</span>
                                    <input
                                        type="date"
                                        value={dateDelivery ?? ""}
                                        onChange={(e) => set("dateDelivery", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[12px] text-soft-text">N° de suivi</span>
                                    <input
                                        type="text"
                                        value={trackingNumber ?? ""}
                                        onChange={(e) => set("trackingNumber", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReceptionCreatePage;
