import {
    FaArrowLeft, FaTrash, FaPlay, FaPause, FaFloppyDisk,
} from "react-icons/fa6";

import { StatusPill } from "src/lib/components/StatusPill";

import { fmtAmount, fmtDate } from "./useInvoiceTemplateData";

// Desktop rendering of the recurring invoice template detail page. Left: the
// (read-only) lines copied from the source invoice. Right: Informations + an
// editable recurring-settings form + Totaux. Strict adherence to the epured UI
// conventions.

const InfoRow = ({ label, value }) => (
    <div className="flex justify-between gap-4 py-1.5 text-[13px] border-b border-soft-border/60 last:border-b-0">
        <span className="text-soft-text">{label}</span>
        <span className="text-strong-text text-right">{value || "-"}</span>
    </div>
);

const TotalRow = ({ label, value, strong = false }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-[13px] ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={strong ? "text-strong-text font-semibold" : "text-strong-text"}>{value}</span>
    </div>
);

const actionBtn = "h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 disabled:opacity-50 transition-colors";
const inputCls = "h-[30px] px-2 rounded border border-soft-border text-[12px] focus:border-primary focus:outline-none";

const UNIT_LABELS = { d: "jour(s)", w: "semaine(s)", m: "mois", y: "an(s)" };
const freqText = (t) => {
    const f = Number(t?.frequency ?? 0);
    if (f <= 0) return "Manuel";
    return `Tous les ${f} ${UNIT_LABELS[t?.unitFrequency] || t?.unitFrequency || ""}`.trim();
};

export const InvoiceTemplatePageDesktop = (props) => {
    const {
        template, loading, error, actionPending, form,
        isSuspended,
        setFormField, handleSuspend, handleUnsuspend, handleGenerate,
        handleSaveSettings, handleDelete, goBack,
    } = props;

    const lines = Array.isArray(template?.lines) ? template.lines : [];

    return (
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            <header className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-soft-border bg-white">
                <button
                    type="button"
                    onClick={goBack}
                    className="p-1.5 -ml-1 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    aria-label="Retour à la liste"
                >
                    <FaArrowLeft className="text-sm" />
                </button>
                <h1 className="text-base font-bold text-strong-text">
                    {loading ? "Chargement..." : (template?.title || "Modèle récurrent")}
                </h1>
                {!loading && template && (
                    <StatusPill feature="invoicerec" status={template.suspended} />
                )}

                <span className="flex-1" />

                {!loading && template && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={actionPending}
                            className={`${actionBtn} bg-primary text-white hover:bg-primary/90`}
                        >
                            <FaPlay className="text-[11px]" />
                            <span>Générer maintenant</span>
                        </button>
                        {isSuspended ? (
                            <button
                                type="button"
                                onClick={handleUnsuspend}
                                disabled={actionPending}
                                className={`${actionBtn} bg-white border border-soft-border text-strong-text hover:bg-medium-bg`}
                            >
                                <FaPlay className="text-[11px]" />
                                <span>Réactiver</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSuspend}
                                disabled={actionPending}
                                className={`${actionBtn} bg-white border border-soft-border text-strong-text hover:bg-medium-bg`}
                            >
                                <FaPause className="text-[11px]" />
                                <span>Suspendre</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={actionPending}
                            className={`${actionBtn} bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300`}
                        >
                            <FaTrash className="text-[11px]" />
                            <span>Supprimer</span>
                        </button>
                    </div>
                )}
            </header>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {error && (
                    <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-2 text-[13px]">
                        {error}
                    </div>
                )}

                {!loading && template && (
                    <div className="flex flex-col lg:flex-row gap-4 items-start">
                        {/* Left: template lines (read-only, copied from source invoice) */}
                        <section className="flex-1 min-w-0 w-full bg-white rounded-xl border border-soft-border overflow-hidden">
                            <header className="px-4 py-2.5 border-b border-soft-border">
                                <h2 className="text-sm font-semibold text-strong-text">Lignes du modèle</h2>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="text-left text-soft-text border-b border-soft-border">
                                            <th className="font-medium px-3 py-2 w-10">#</th>
                                            <th className="font-medium px-3 py-2">Désignation</th>
                                            <th className="font-medium px-3 py-2 text-right w-20">Qté</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">PU HT</th>
                                            <th className="font-medium px-3 py-2 text-right w-20">TVA</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">Total HT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-4 text-center text-soft-text">
                                                    Aucune ligne
                                                </td>
                                            </tr>
                                        )}
                                        {lines.map((l, idx) => (
                                            <tr key={l.id ?? idx} className="border-b border-soft-border/60 hover:bg-medium-bg/50 transition-colors">
                                                <td className="px-3 py-2 text-soft-text">{idx + 1}</td>
                                                <td className="px-3 py-2 text-strong-text">{l.label || l.description || l.productRef || "-"}</td>
                                                <td className="px-3 py-2 text-right">{Number(l.qty ?? 0)}</td>
                                                <td className="px-3 py-2 text-right">{fmtAmount(l.subprice)}</td>
                                                <td className="px-3 py-2 text-right">{l.tvaTx != null ? `${Number(l.tvaTx).toFixed(2)} %` : ""}</td>
                                                <td className="px-3 py-2 text-right">{fmtAmount(l.totalHt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Right rail */}
                        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Informations</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <InfoRow label="Client" value={template.socid ? `#${template.socid}` : ""} />
                                    <InfoRow label="Récurrence" value={freqText(template)} />
                                    <InfoRow label="Prochaine génération" value={fmtDate(template.dateWhen)} />
                                    <InfoRow label="Dernière génération" value={fmtDate(template.dateLastGen)} />
                                    <InfoRow label="Générées" value={`${Number(template.nbGenDone ?? 0)}${Number(template.nbGenMax ?? 0) > 0 ? ` / ${Number(template.nbGenMax)}` : ""}`} />
                                    <InfoRow label="Validation auto" value={template.autoValidate ? "Oui" : "Non"} />
                                </div>
                            </section>

                            {form && (
                                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                    <header className="px-4 py-2.5 border-b border-soft-border">
                                        <h2 className="text-sm font-semibold text-strong-text">Réglages de récurrence</h2>
                                    </header>
                                    <div className="px-4 py-3 flex flex-col gap-2.5">
                                        <label className="flex flex-col gap-1">
                                            <span className="text-[12px] text-soft-text">Titre du modèle</span>
                                            <input type="text" value={form.title} onChange={(e) => setFormField("title", e.target.value)} className={inputCls} />
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex flex-col gap-1">
                                                <span className="text-[12px] text-soft-text">Fréquence</span>
                                                <input type="number" min="0" value={form.frequency} onChange={(e) => setFormField("frequency", e.target.value)} className={inputCls} />
                                            </label>
                                            <label className="flex flex-col gap-1">
                                                <span className="text-[12px] text-soft-text">Unité</span>
                                                <select value={form.unitFrequency} onChange={(e) => setFormField("unitFrequency", e.target.value)} className={inputCls}>
                                                    <option value="d">Jour(s)</option>
                                                    <option value="w">Semaine(s)</option>
                                                    <option value="m">Mois</option>
                                                    <option value="y">An(s)</option>
                                                </select>
                                            </label>
                                        </div>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-[12px] text-soft-text">Prochaine génération</span>
                                            <input type="date" value={form.dateWhen} onChange={(e) => setFormField("dateWhen", e.target.value)} className={inputCls} />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-[12px] text-soft-text">Nombre max de générations (0 = illimité)</span>
                                            <input type="number" min="0" value={form.nbGenMax} onChange={(e) => setFormField("nbGenMax", e.target.value)} className={inputCls} />
                                        </label>
                                        <label className="flex items-center gap-2 text-[12px] text-strong-text">
                                            <input type="checkbox" checked={form.autoValidate} onChange={(e) => setFormField("autoValidate", e.target.checked)} />
                                            <span>Valider automatiquement les factures générées</span>
                                        </label>
                                        <label className="flex items-center gap-2 text-[12px] text-strong-text">
                                            <input type="checkbox" checked={form.usenewprice} onChange={(e) => setFormField("usenewprice", e.target.checked)} />
                                            <span>Rafraîchir les prix produits à la génération</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleSaveSettings}
                                            disabled={actionPending}
                                            className="h-[32px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                        >
                                            <FaFloppyDisk className="text-[11px]" />
                                            <span>Enregistrer les réglages</span>
                                        </button>
                                    </div>
                                </section>
                            )}

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <TotalRow label="Total HT" value={`${fmtAmount(template.totalHt)} EUR`} />
                                    <TotalRow label="TVA" value={`${fmtAmount(template.totalTva)} EUR`} />
                                    <TotalRow label="Total TTC" value={`${fmtAmount(template.totalTtc)} EUR`} strong />
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
