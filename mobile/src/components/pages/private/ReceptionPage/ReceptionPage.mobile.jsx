import { FaArrowLeft, FaCheck, FaBoxesPacking } from "react-icons/fa6";

import { Page } from "@cap-rel/smartcommon";

import { fmtAmount, fmtDate } from "./useReceptionData";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Reçue",
};

// Mobile rendering of the reception detail: a lean read view with the two key
// status transitions (validate, close). Full management lives on desktop.
export const ReceptionPageMobile = (props) => {
    const {
        reception, loading, error, actionPending,
        isDraft, isValidated,
        handleValidate, handleClose, goBack,
    } = props;

    const lines = Array.isArray(reception?.lines) ? reception.lines : [];

    return (
        <Page contentProps={{ className: "pb-app-base" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base">
                <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : (reception?.ref || "Réception")}
                </h1>
                {reception && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {STATUS_LABELS[reception.statut] ?? "?"}
                    </span>
                )}
            </div>

            {error && (
                <div className="mx-app-base mt-app-base bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>
            )}

            {!loading && reception && (
                <div className="px-app-base mt-app-base flex flex-col gap-app-sm">
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm flex flex-col gap-1">
                        <div className="flex justify-between"><span className="text-gray-500">Fournisseur</span><span>{reception.socid ? `#${reception.socid}` : "-"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Réception</span><span>{fmtDate(reception.dateReception) || "-"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Réf. fourn.</span><span>{reception.refSupplier || "-"}</span></div>
                        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100 mt-1"><span>Total HT</span><span>{fmtAmount(reception.totalHt)} EUR</span></div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="font-semibold text-sm mb-2">Lignes</div>
                        {lines.length === 0 && <div className="text-gray-500 text-sm">Aucune ligne</div>}
                        {lines.map((l, idx) => (
                            <div key={l.id ?? idx} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                                <span className="truncate pr-2">{l.label || "-"}</span>
                                <span className="shrink-0">{Number(l.qty ?? 0)}</span>
                            </div>
                        ))}
                    </div>

                    {(isDraft || isValidated) && (
                        <div className="flex gap-app-sm">
                            {isDraft && (
                                <button
                                    onClick={handleValidate}
                                    disabled={actionPending}
                                    className="flex-1 p-3 rounded-lg bg-primary text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <FaCheck /> Valider
                                </button>
                            )}
                            {isValidated && (
                                <button
                                    onClick={handleClose}
                                    disabled={actionPending}
                                    className="flex-1 p-3 rounded-lg bg-emerald-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <FaBoxesPacking /> Classer reçue
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Page>
    );
};
