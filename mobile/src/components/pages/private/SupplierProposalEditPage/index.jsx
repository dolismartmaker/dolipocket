import { FaArrowLeft, FaFloppyDisk } from "react-icons/fa6";

import { useSupplierProposalEditData } from "./useSupplierProposalEditData";

// Create / edit header form for a supplier price request. Single responsive
// form: on /new the user picks a supplier; on /:id/edit the supplier is fixed
// and only the header metadata (delivery date, notes) is editable. Lines are
// managed on the detail page via <DocumentLinesEditor>.
export const SupplierProposalEditPage = () => {
    const {
        isEdit, suppliers, socid, deliveryDate, notePublic, notePrivate,
        loading, saving, error, set, goBack, submit,
    } = useSupplierProposalEditData();

    const inputCls = "h-[34px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none";

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text">
                    {isEdit ? "Modifier la demande de prix" : "Nouvelle demande de prix"}
                </h1>
                <span className="flex-1" />
                <button
                    type="button"
                    onClick={submit}
                    disabled={saving || loading}
                    className="h-[30px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaFloppyDisk className="text-[11px]" />
                    <span>Enregistrer</span>
                </button>
            </header>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {loading && <div className="text-soft-text text-sm">Chargement...</div>}
                {error && (
                    <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-2 text-[13px]">
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <section className="bg-white rounded-xl border border-soft-border overflow-hidden max-w-2xl">
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <h2 className="text-sm font-semibold text-strong-text">Informations</h2>
                        </header>
                        <div className="px-4 py-3 flex flex-col gap-3">
                            {!isEdit && (
                                <label className="flex flex-col gap-1">
                                    <span className="text-[12px] text-soft-text">Fournisseur</span>
                                    <select
                                        value={socid ?? ""}
                                        onChange={(e) => set("socid", e.target.value)}
                                        className={inputCls}
                                    >
                                        <option value="">-- Sélectionner un fournisseur --</option>
                                        {(suppliers ?? []).map((s) => (
                                            <option key={s.id} value={s.id}>{s.name || `#${s.id}`}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Date de livraison souhaitée</span>
                                <input
                                    type="date"
                                    value={deliveryDate ?? ""}
                                    onChange={(e) => set("deliveryDate", e.target.value)}
                                    className={inputCls}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Note publique</span>
                                <textarea
                                    rows={3}
                                    value={notePublic ?? ""}
                                    onChange={(e) => set("notePublic", e.target.value)}
                                    className="px-2 py-1.5 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Note privée</span>
                                <textarea
                                    rows={3}
                                    value={notePrivate ?? ""}
                                    onChange={(e) => set("notePrivate", e.target.value)}
                                    className="px-2 py-1.5 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none"
                                />
                            </label>
                            {!isEdit && (
                                <p className="text-[12px] text-soft-text">
                                    Après création, ajoutez les lignes de produits depuis la fiche de la demande de prix.
                                </p>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default SupplierProposalEditPage;
