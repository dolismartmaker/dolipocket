import {
    FaArrowLeft, FaPen, FaCheck, FaXmark, FaTrash, FaFilePdf, FaPaperPlane,
    FaDownload,
} from "react-icons/fa6";

import { DocumentLinesTable, DocumentHeaderFields } from "src/lib/datatable";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

import { fmtAmount, fmtDate } from "./useProposalData";

// Desktop rendering of the proposal detail page. Dolibarr-style layout:
// - Sticky top action bar (Back / Title / Status / Actions)
// - 2 columns: Lines (large left, catalog-driven via <DocumentLinesTable>)
//              + side rail (Informations via <DocumentHeaderFields> +
//              Totaux + Notes hardcoded for stability).
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées" :
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max)
//   - separators via border-b, never shadow
//   - hover:bg-gray-50 only, no transition-all, no hover:shadow-md
//   - no active:, no rounded-2xl, no gradient on cards.

const TotalRow = ({ label, value, strong = false }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-[13px] ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={strong ? "text-strong-text font-semibold" : "text-strong-text"}>{value}</span>
    </div>
);

// Header field overrides (label + visibility + formatter) for the Proposal
// "Informations" panel. The labels come from the catalog by default; we
// keep a few overrides where the Dolibarr translation is too generic.
const HEADER_OVERRIDES = {
    ref:         { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:   { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:       { defaultVisible: true,  formatter: (v) => v ? `#${v}` : "-" },
    datep:       { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    finValidite: { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    statut:      { defaultVisible: true,  formatter: (v) => getStatusInfo("proposal", v).label },
    totalHt:     { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
    totalTtc:    { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
};

// Lines column overrides: defaults visibility + widths + formatters for
// the Proposal lines table. Other columns (description, productRef, ...)
// fall back to the catalog defaults.
const LINES_OVERRIDES = {
    rang:     { defaultVisible: true,  defaultWidth: 50 },
    label:    { defaultVisible: true,  defaultWidth: 240 },
    qty:      { defaultVisible: true,  defaultWidth: 70, formatter: (v) => Number(v ?? 0) },
    subprice: { defaultVisible: true,  defaultWidth: 110, formatter: (v) => fmtAmount(v) },
    tvaTx:    { defaultVisible: true,  defaultWidth: 80,  formatter: (v) => v != null ? `${Number(v).toFixed(2)} %` : "" },
    totalHt:  { defaultVisible: true,  defaultWidth: 120, formatter: (v) => fmtAmount(v) },
    totalTtc: { defaultVisible: false, defaultWidth: 120, formatter: (v) => fmtAmount(v) },
};

export const ProposalPageDesktop = (props) => {
    const {
        proposal, loading, error, actionPending,
        isDraft, isValidated,
        handleValidate, handleSign, handleUnsign, handleDelete,
        handleConvertToOrder,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc,
        goEdit, goBack,
        dataSource,
        setProposal,
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
    } = props;

    // Default recipient: try the thirdparty email from the proposal object
    // when it has been hydrated by fetch_thirdparty backend-side. Falls
    // back to empty so the modal asks the user for it.
    const defaultRecipient = proposal?.thirdparty?.email
        ?? proposal?.socEmail
        ?? proposal?.email
        ?? "";
    const refLabel = proposal?.ref ? proposal.ref : `#${proposal?.id ?? ""}`;
    const defaultSubject = `Devis ${refLabel}`.trim();
    const defaultBody = `Bonjour,\n\nVeuillez trouver ci-joint le devis ${refLabel}.\n\nCordialement.`;

    return (
        <>
        <div className="flex flex-col h-full w-full bg-medium-bg overflow-hidden">
            {/* Sticky top action bar */}
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
                    {loading ? "Chargement..." : (proposal?.ref || "Devis")}
                </h1>
                {!loading && proposal && (
                    <StatusPill feature="proposal" status={proposal.statut} />
                )}

                <span className="flex-1" />

                {!loading && proposal && (
                    <div className="flex items-center gap-2">
                        {isDraft && (
                            <button
                                type="button"
                                onClick={goEdit}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                            >
                                <FaPen className="text-[11px]" />
                                <span>Modifier</span>
                            </button>
                        )}
                        {isDraft && (
                            <button
                                type="button"
                                onClick={handleValidate}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                                <FaCheck className="text-[11px]" />
                                <span>Valider</span>
                            </button>
                        )}
                        {isValidated && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSign}
                                    disabled={actionPending}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                    <FaCheck className="text-[11px]" />
                                    <span>Signé</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUnsign}
                                    disabled={actionPending}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                >
                                    <FaXmark className="text-[11px]" />
                                    <span>Non signé</span>
                                </button>
                            </>
                        )}
                        {/* Convert to Order: available once the proposal is
                            signed (statut 2) -- mirrors Dolibarr standard
                            "Classer signé" -> "Créer commande" workflow. */}
                        {proposal?.statut === 2 && (
                            <button
                                type="button"
                                onClick={handleConvertToOrder}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                <FaCheck className="text-[11px]" />
                                <span>Créer une commande</span>
                            </button>
                        )}
                        {/* Always-visible PDF generator (any statut). After
                            generation the hook auto-triggers the download. */}
                        <button
                            type="button"
                            onClick={handleGeneratePdf}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                        >
                            <FaFilePdf className="text-[11px]" />
                            <span>Générer PDF</span>
                        </button>
                        {/* Standalone "Télécharger PDF": reads last_main_doc,
                            does NOT regenerate. Hidden when no PDF has ever
                            been generated for this document. */}
                        {hasLastMainDoc && (
                            <button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                            >
                                <FaDownload className="text-[11px]" />
                                <span>Télécharger PDF</span>
                            </button>
                        )}
                        {/* Send the proposal by email with the last PDF attached. */}
                        <button
                            type="button"
                            onClick={openSendEmail}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            <FaPaperPlane className="text-[11px]" />
                            <span>Envoyer</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                        >
                            <FaTrash className="text-[11px]" />
                            <span>Supprimer</span>
                        </button>
                    </div>
                )}
            </header>

            {error && (
                <div className="shrink-0 mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                    {error}
                </div>
            )}

            {/* Two-column body: lines (left, large) + meta rail (right, narrow) */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && proposal && (
                    <div className="grid grid-cols-3 gap-4 max-w-[1400px] mx-auto">
                        {/* LEFT : catalog-driven lines table + documents list */}
                        <div className="col-span-2 flex flex-col gap-4">
                            {/* Editable lines panel: ajout/modification/
                                suppression directement depuis la page détail.
                                Le mode read-only (DocumentLinesTable
                                catalog-driven) reste exporté pour les pages
                                qui n'ont pas besoin d'édition. */}
                            <DocumentLinesEditor
                                docId={Number(proposal.id)}
                                lines={proposal.lines ?? []}
                                dataSource={dataSource}
                                onChange={(updated) => {
                                    if (updated && typeof setProposal === "function") {
                                        setProposal(updated);
                                    }
                                }}
                                readOnly={proposal.statut !== 0}
                            />
                            {/* Generated PDFs + attached uploads for this
                                proposal (task 4). refreshKey is bumped
                                each time lastMainDoc changes so a freshly
                                generated PDF appears without a manual
                                refresh. */}
                            <DocumentsSection
                                objectType="proposal"
                                objectId={Number(proposal.id)}
                                refreshKey={proposal.lastMainDoc || ""}
                            />
                        </div>

                        {/* RIGHT rail : Informations + Totaux + Notes */}
                        <aside className="col-span-1 flex flex-col gap-4">
                            <DocumentHeaderFields
                                object={proposal}
                                feature="proposal"
                                dataSource={dataSource}
                                storageKey="dolipocket.proposalpage.header"
                                title="Informations"
                                overrides={HEADER_OVERRIDES}
                            />

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <TotalRow label="Total HT"  value={`${fmtAmount(proposal.totalHt)} EUR`} />
                                    <TotalRow label="TVA"       value={`${fmtAmount(proposal.totalTva)} EUR`} />
                                    <TotalRow label="Total TTC" value={`${fmtAmount(proposal.totalTtc)} EUR`} strong />
                                </div>
                            </section>

                            {(proposal.notePublic || proposal.notePrivate) && (
                                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                    <header className="px-4 py-2.5 border-b border-soft-border">
                                        <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                                    </header>
                                    <div className="px-4 py-3 space-y-3 text-[13px]">
                                        {proposal.notePublic && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Publique</div>
                                                <div className="whitespace-pre-wrap text-strong-text">
                                                    {proposal.notePublic}
                                                </div>
                                            </div>
                                        )}
                                        {proposal.notePrivate && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Privée</div>
                                                <div className="whitespace-pre-wrap text-strong-text">
                                                    {proposal.notePrivate}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </aside>
                    </div>
                )}
            </div>
        </div>

        <SendEmailModal
            open={!!sendEmailOpen}
            onClose={closeSendEmail}
            onSend={submitSendEmail}
            defaultTo={defaultRecipient}
            defaultSubject={defaultSubject}
            defaultBody={defaultBody}
            defaultAttachment=""
            docLabel="devis"
        />
        </>
    );
};
