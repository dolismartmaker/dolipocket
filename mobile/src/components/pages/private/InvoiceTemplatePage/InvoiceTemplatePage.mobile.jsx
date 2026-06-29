import { FaArrowLeft, FaPlay, FaPause } from "react-icons/fa6";

import { Page } from "@cap-rel/smartcommon";

import { fmtAmount, fmtDate } from "./useInvoiceTemplateData";

const STATUS_LABELS = { 0: "Actif", 1: "Suspendu" };
const UNIT_LABELS = { d: "jour(s)", w: "semaine(s)", m: "mois", y: "an(s)" };
const freqText = (t) => {
    const f = Number(t?.frequency ?? 0);
    if (f <= 0) return "Manuel";
    return `Tous les ${f} ${UNIT_LABELS[t?.unitFrequency] || t?.unitFrequency || ""}`.trim();
};

// Mobile rendering of the recurring template detail: lean read view with the
// generate + suspend/reactivate actions. Full editing lives on desktop.
export const InvoiceTemplatePageMobile = (props) => {
    const {
        template, loading, error, actionPending,
        isSuspended,
        handleGenerate, handleSuspend, handleUnsuspend, goBack,
    } = props;

    const lines = Array.isArray(template?.lines) ? template.lines : [];

    return (
        <Page contentProps={{ className: "pb-app-base" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base">
                <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1 truncate">
                    {loading ? "Chargement..." : (template?.title || "Modèle")}
                </h1>
                {template && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {STATUS_LABELS[template.suspended] ?? "?"}
                    </span>
                )}
            </div>

            {error && (
                <div className="mx-app-base mt-app-base bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>
            )}

            {!loading && template && (
                <div className="px-app-base mt-app-base flex flex-col gap-app-sm">
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm flex flex-col gap-1">
                        <div className="flex justify-between"><span className="text-gray-500">Client</span><span>{template.socid ? `#${template.socid}` : "-"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Récurrence</span><span>{freqText(template)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Prochaine</span><span>{fmtDate(template.dateWhen) || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Générées</span><span>{Number(template.nbGenDone ?? 0)}{Number(template.nbGenMax ?? 0) > 0 ? ` / ${Number(template.nbGenMax)}` : ""}</span></div>
                        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100 mt-1"><span>Total TTC</span><span>{fmtAmount(template.totalTtc)} EUR</span></div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="font-semibold text-sm mb-2">Lignes</div>
                        {lines.length === 0 && <div className="text-gray-500 text-sm">Aucune ligne</div>}
                        {lines.map((l, idx) => (
                            <div key={l.id ?? idx} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                                <span className="truncate pr-2">{l.label || l.description || "-"}</span>
                                <span className="shrink-0">{Number(l.qty ?? 0)} x {fmtAmount(l.subprice)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-app-sm">
                        <button
                            onClick={handleGenerate}
                            disabled={actionPending}
                            className="flex-1 p-3 rounded-lg bg-primary text-white flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <FaPlay /> Générer
                        </button>
                        {isSuspended ? (
                            <button
                                onClick={handleUnsuspend}
                                disabled={actionPending}
                                className="flex-1 p-3 rounded-lg bg-white border border-gray-200 text-gray-900 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FaPlay /> Réactiver
                            </button>
                        ) : (
                            <button
                                onClick={handleSuspend}
                                disabled={actionPending}
                                className="flex-1 p-3 rounded-lg bg-white border border-gray-200 text-gray-900 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <FaPause /> Suspendre
                            </button>
                        )}
                    </div>
                </div>
            )}
        </Page>
    );
};
