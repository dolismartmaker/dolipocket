import { FaArrowLeft, FaCheck, FaThumbsUp } from "react-icons/fa6";

import { Page } from "@cap-rel/smartcommon";

import { fmtAmount, fmtDate } from "./useSupplierProposalData";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Signée",
    3: "Non signée",
    4: "Fermée",
};

// Mobile rendering of the supplier price request detail: lean read view with
// the two key transitions (validate, sign). Full management lives on desktop.
export const SupplierProposalPageMobile = (props) => {
    const {
        proposal, loading, error, actionPending,
        isDraft, isValidated,
        handleValidate, handleCloseSigned, goBack,
    } = props;

    const lines = Array.isArray(proposal?.lines) ? proposal.lines : [];

    return (
        <Page contentProps={{ className: "pb-app-base" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base">
                <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : (proposal?.ref || "Demande de prix")}
                </h1>
                {proposal && (
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {STATUS_LABELS[proposal.statut] ?? "?"}
                    </span>
                )}
            </div>

            {error && (
                <div className="mx-app-base mt-app-base bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>
            )}

            {!loading && proposal && (
                <div className="px-app-base mt-app-base flex flex-col gap-app-sm">
                    <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm flex flex-col gap-1">
                        <div className="flex justify-between"><span className="text-gray-500">Fournisseur</span><span>{proposal.socid ? `#${proposal.socid}` : "-"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Créée le</span><span>{fmtDate(proposal.dateCreation) || "-"}</span></div>
                        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100 mt-1"><span>Total HT</span><span>{fmtAmount(proposal.totalHt)} EUR</span></div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="font-semibold text-sm mb-2">Lignes</div>
                        {lines.length === 0 && <div className="text-gray-500 text-sm">Aucune ligne</div>}
                        {lines.map((l, idx) => (
                            <div key={l.id ?? idx} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-b-0">
                                <span className="truncate pr-2">{l.label || l.productLabel || "-"}</span>
                                <span className="shrink-0">{Number(l.qty ?? 0)} x {fmtAmount(l.subprice)}</span>
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
                                    onClick={handleCloseSigned}
                                    disabled={actionPending}
                                    className="flex-1 p-3 rounded-lg bg-emerald-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <FaThumbsUp /> Signer
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Page>
    );
};
