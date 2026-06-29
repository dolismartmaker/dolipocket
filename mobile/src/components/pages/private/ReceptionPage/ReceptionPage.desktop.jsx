import {
    FaArrowLeft, FaCheck, FaTrash, FaRotateLeft, FaBoxesPacking, FaLockOpen,
} from "react-icons/fa6";

import { DocumentLinksSection } from "src/lib/components/DocumentLinksSection";
import { StatusPill } from "src/lib/components/StatusPill";

import { fmtAmount, fmtDate } from "./useReceptionData";

// Desktop rendering of the reception detail page. Dolibarr-style layout:
// - Sticky top action bar (Back / Ref / Status / status transitions)
// - 2 columns: reception lines (warehouse + asked/received qty + lot) on the
//              left, Informations + Totaux + linked supplier order on the right.
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées".

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

export const ReceptionPageDesktop = (props) => {
    const {
        reception, loading, error, actionPending,
        isDraft, isValidated, isClosed,
        handleValidate, handleClose, handleReopen, handleSetDraft, handleDelete,
        goBack, dbReceptions,
    } = props;

    const lines = Array.isArray(reception?.lines) ? reception.lines : [];

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
                    {loading ? "Chargement..." : (reception?.ref || "Réception")}
                </h1>
                {!loading && reception && (
                    <StatusPill feature="reception" status={reception.statut} />
                )}

                <span className="flex-1" />

                {!loading && reception && (
                    <div className="flex items-center gap-2">
                        {isDraft && (
                            <button
                                type="button"
                                onClick={handleValidate}
                                disabled={actionPending}
                                className={`${actionBtn} bg-primary text-white hover:bg-primary/90`}
                            >
                                <FaCheck className="text-[11px]" />
                                <span>Valider</span>
                            </button>
                        )}
                        {isValidated && (
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={actionPending}
                                className={`${actionBtn} bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                                <FaBoxesPacking className="text-[11px]" />
                                <span>Classer reçue</span>
                            </button>
                        )}
                        {isValidated && (
                            <button
                                type="button"
                                onClick={handleSetDraft}
                                disabled={actionPending}
                                className={`${actionBtn} bg-white border border-soft-border text-strong-text hover:bg-medium-bg`}
                            >
                                <FaRotateLeft className="text-[11px]" />
                                <span>Repasser en brouillon</span>
                            </button>
                        )}
                        {isClosed && (
                            <button
                                type="button"
                                onClick={handleReopen}
                                disabled={actionPending}
                                className={`${actionBtn} bg-white border border-soft-border text-strong-text hover:bg-medium-bg`}
                            >
                                <FaLockOpen className="text-[11px]" />
                                <span>Rouvrir</span>
                            </button>
                        )}
                        {isDraft && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={actionPending}
                                className={`${actionBtn} bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300`}
                            >
                                <FaTrash className="text-[11px]" />
                                <span>Supprimer</span>
                            </button>
                        )}
                    </div>
                )}
            </header>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {error && (
                    <div className="mb-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-3 py-2 text-[13px]">
                        {error}
                    </div>
                )}

                {!loading && reception && (
                    <div className="flex flex-col lg:flex-row gap-4 items-start">
                        {/* Left: reception lines */}
                        <section className="flex-1 min-w-0 w-full bg-white rounded-xl border border-soft-border overflow-hidden">
                            <header className="px-4 py-2.5 border-b border-soft-border">
                                <h2 className="text-sm font-semibold text-strong-text">Lignes reçues</h2>
                            </header>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="text-left text-soft-text border-b border-soft-border">
                                            <th className="font-medium px-3 py-2 w-10">#</th>
                                            <th className="font-medium px-3 py-2">Produit</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">Qté commandée</th>
                                            <th className="font-medium px-3 py-2 text-right w-24">Qté reçue</th>
                                            <th className="font-medium px-3 py-2 text-right w-24">Entrepôt</th>
                                            <th className="font-medium px-3 py-2 w-24">Lot/Série</th>
                                            <th className="font-medium px-3 py-2 text-right w-28">Total HT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-4 text-center text-soft-text">
                                                    Aucune ligne
                                                </td>
                                            </tr>
                                        )}
                                        {lines.map((l, idx) => (
                                            <tr key={l.id ?? idx} className="border-b border-soft-border/60 hover:bg-medium-bg/50 transition-colors">
                                                <td className="px-3 py-2 text-soft-text">{idx + 1}</td>
                                                <td className="px-3 py-2 text-strong-text">
                                                    <div className="font-medium">{l.label || "-"}</div>
                                                    {l.refSupplier && <div className="text-soft-text text-[12px]">{l.refSupplier}</div>}
                                                </td>
                                                <td className="px-3 py-2 text-right">{Number(l.qtyAsked ?? 0)}</td>
                                                <td className="px-3 py-2 text-right font-semibold">{Number(l.qty ?? 0)}</td>
                                                <td className="px-3 py-2 text-right">{l.entrepotId ? `#${l.entrepotId}` : "-"}</td>
                                                <td className="px-3 py-2">{l.batch || "-"}</td>
                                                <td className="px-3 py-2 text-right">{fmtAmount(l.totalHt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Right rail: informations + totaux + linked order + notes */}
                        <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-4">
                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Informations</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <InfoRow label="Référence" value={reception.ref} />
                                    <InfoRow label="Fournisseur" value={reception.socid ? `#${reception.socid}` : ""} />
                                    <InfoRow label="Réf. fournisseur" value={reception.refSupplier} />
                                    <InfoRow label="Date de réception" value={fmtDate(reception.dateReception)} />
                                    <InfoRow label="Livraison prévue" value={fmtDate(reception.dateDelivery)} />
                                    <InfoRow label="N° de suivi" value={reception.trackingNumber} />
                                    <InfoRow label="Poids" value={reception.weight ? `${reception.weight}` : ""} />
                                </div>
                            </section>

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <TotalRow label="Total HT" value={`${fmtAmount(reception.totalHt)} EUR`} />
                                    <TotalRow label="TVA" value={`${fmtAmount(reception.totalTva)} EUR`} />
                                    <TotalRow label="Total TTC" value={`${fmtAmount(reception.totalTtc)} EUR`} strong />
                                </div>
                            </section>

                            <DocumentLinksSection docId={reception.id} dataSource={dbReceptions} />

                            {(reception.notePublic || reception.notePrivate) && (
                                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                    <header className="px-4 py-2.5 border-b border-soft-border">
                                        <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                                    </header>
                                    <div className="px-4 py-2 text-[13px] text-strong-text whitespace-pre-wrap">
                                        {reception.notePublic && <div className="mb-2">{reception.notePublic}</div>}
                                        {reception.notePrivate && <div className="text-soft-text">{reception.notePrivate}</div>}
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
