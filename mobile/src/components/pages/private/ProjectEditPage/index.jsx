import { FaArrowLeft, FaFloppyDisk } from "react-icons/fa6";

import { useProjectEditData } from "./useProjectEditData";

// Create / edit form for a project. Single responsive form (works on mobile and
// desktop). Opportunity fields are optional and only meaningful when the tenant
// enables PROJECT_USE_OPPORTUNITIES; they are kept minimal here.
export const ProjectEditPage = () => {
    const {
        isEdit, thirdparties, title, socid, publicFlag, dateStart, dateEnd,
        budget, oppAmount, oppPercent, description, notePublic, notePrivate,
        loading, saving, error, set, goBack, submit,
    } = useProjectEditData();

    const inputCls = "h-[34px] px-2 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none";
    const areaCls = "px-2 py-1.5 rounded border border-soft-border text-[13px] focus:border-primary focus:outline-none";

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
                    {isEdit ? "Modifier le projet" : "Nouveau projet"}
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
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Libellé du projet *</span>
                                <input
                                    type="text"
                                    value={title ?? ""}
                                    onChange={(e) => set("title", e.target.value)}
                                    className={inputCls}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Tiers</span>
                                <select
                                    value={socid ?? ""}
                                    onChange={(e) => set("socid", e.target.value)}
                                    className={inputCls}
                                >
                                    <option value="">-- Aucun tiers --</option>
                                    {(thirdparties ?? []).map((t) => (
                                        <option key={t.id} value={t.id}>{t.name || `#${t.id}`}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Visibilité</span>
                                <select
                                    value={publicFlag ?? "0"}
                                    onChange={(e) => set("publicFlag", e.target.value)}
                                    className={inputCls}
                                >
                                    <option value="0">Privé</option>
                                    <option value="1">Public</option>
                                </select>
                            </label>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <label className="flex flex-col gap-1 flex-1">
                                    <span className="text-[12px] text-soft-text">Date de début</span>
                                    <input
                                        type="date"
                                        value={dateStart ?? ""}
                                        onChange={(e) => set("dateStart", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 flex-1">
                                    <span className="text-[12px] text-soft-text">Date de fin</span>
                                    <input
                                        type="date"
                                        value={dateEnd ?? ""}
                                        onChange={(e) => set("dateEnd", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Budget (EUR)</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={budget ?? ""}
                                    onChange={(e) => set("budget", e.target.value)}
                                    className={inputCls}
                                />
                            </label>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <label className="flex flex-col gap-1 flex-1">
                                    <span className="text-[12px] text-soft-text">Montant opportunité (EUR)</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={oppAmount ?? ""}
                                        onChange={(e) => set("oppAmount", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                                <label className="flex flex-col gap-1 flex-1">
                                    <span className="text-[12px] text-soft-text">Probabilité (%)</span>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        max="100"
                                        value={oppPercent ?? ""}
                                        onChange={(e) => set("oppPercent", e.target.value)}
                                        className={inputCls}
                                    />
                                </label>
                            </div>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Description</span>
                                <textarea
                                    rows={3}
                                    value={description ?? ""}
                                    onChange={(e) => set("description", e.target.value)}
                                    className={areaCls}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Note publique</span>
                                <textarea
                                    rows={3}
                                    value={notePublic ?? ""}
                                    onChange={(e) => set("notePublic", e.target.value)}
                                    className={areaCls}
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] text-soft-text">Note privée</span>
                                <textarea
                                    rows={3}
                                    value={notePrivate ?? ""}
                                    onChange={(e) => set("notePrivate", e.target.value)}
                                    className={areaCls}
                                />
                            </label>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default ProjectEditPage;
