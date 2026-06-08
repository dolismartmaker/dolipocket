import {
    FaArrowLeft, FaPen, FaTrash, FaCheck, FaTruck, FaFileInvoice, FaThumbsUp, FaFilePdf, FaPaperPlane, FaDownload,
} from "react-icons/fa6";

import { DocumentLinesTable, DocumentHeaderFields } from "src/lib/datatable";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

import { fmtAmount, fmtDate } from "./useSupplierOrderData";

// Desktop rendering of the supplier order detail page. Same canonical
// layout as ProposalPage.desktop : sticky header (back/title/status/
// actions) + 2-col body (lines left catalog-driven, side rail right
// with Informations catalog-driven + Totaux + Notes hardcoded).
//
// Strict adherence to "Conventions UI desktop épurées" (cf .claude/CLAUDE.md).

const TotalRow = ({ label, value, strong = false }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-[13px] ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={strong ? "text-strong-text font-semibold" : "text-strong-text"}>{value}</span>
    </div>
);

const HEADER_OVERRIDES = {
    ref:            { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refSupplier:    { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:          { defaultVisible: true,  formatter: (v, row) => row?.thirdpartyName || (v ? `#${v}` : "-") },
    dateCommande:   { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    dateLivraison:  { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    statut:         { defaultVisible: true,  formatter: (v) => getStatusInfo("supplierorder", v).label },
    fkUserApprove:  { defaultVisible: false, formatter: (v) => v ? `#${v}` : "-" },
    fkUserAuthor:   { defaultVisible: false, formatter: (v) => v ? `#${v}` : "-" },
    totalHt:        { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
    totalTtc:       { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
};

const LINES_OVERRIDES = {
    rang:     { defaultVisible: true,  defaultWidth: 50 },
    label:    { defaultVisible: true,  defaultWidth: 240 },
    qty:      { defaultVisible: true,  defaultWidth: 70, formatter: (v) => Number(v ?? 0) },
    subprice: { defaultVisible: true,  defaultWidth: 110, formatter: (v) => fmtAmount(v) },
    tvaTx:    { defaultVisible: true,  defaultWidth: 80,  formatter: (v) => v != null ? `${Number(v).toFixed(2)} %` : "" },
    totalHt:  { defaultVisible: true,  defaultWidth: 120, formatter: (v) => fmtAmount(v) },
    totalTtc: { defaultVisible: false, defaultWidth: 120, formatter: (v) => fmtAmount(v) },
};

export const SupplierOrderPageDesktop = (props) => {
    const {
        order, loading, error, actionPending,
        statut, isDraft, canApprove, canOrder, canReceive, canConvertToInvoice,
        handleValidate, handleApprove, handleOrder, handleReceive,
        handleDelete, handleConvertToInvoice,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc,
        goEdit, goBack,
        dataSource,
        setSupplierOrder,
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
    } = props;

    const defaultRecipient = order?.thirdparty?.email
        ?? order?.socEmail
        ?? order?.email
        ?? "";
    const refLabel = order?.ref ? order.ref : `#${order?.id ?? ""}`;
    const defaultSubject = `Commande fournisseur ${refLabel}`.trim();
    const defaultBody = `Bonjour,\n\nVeuillez trouver ci-joint la commande fournisseur ${refLabel}.\n\nCordialement.`;

    return (
        <>
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
                    {loading ? "Chargement..." : (order?.ref || "Commande fournisseur")}
                </h1>
                {!loading && order && (
                    <StatusPill feature="supplierorder" status={statut} />
                )}

                <span className="flex-1" />

                {!loading && order && (
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
                        {canApprove && (
                            <button
                                type="button"
                                onClick={handleApprove}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                <FaThumbsUp className="text-[11px]" />
                                <span>Approuver</span>
                            </button>
                        )}
                        {canOrder && (
                            <button
                                type="button"
                                onClick={handleOrder}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                            >
                                <FaTruck className="text-[11px]" />
                                <span>Commander</span>
                            </button>
                        )}
                        {canReceive && (
                            <button
                                type="button"
                                onClick={handleReceive}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
                            >
                                <FaCheck className="text-[11px]" />
                                <span>Réceptionner</span>
                            </button>
                        )}
                        {canConvertToInvoice && (
                            <button
                                type="button"
                                onClick={handleConvertToInvoice}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                            >
                                <FaFileInvoice className="text-[11px]" />
                                <span>Facturer</span>
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
                        {/* Standalone "Télécharger PDF" -- reads last_main_doc,
                            no regeneration. */}
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
                        {/* Send the supplier order by email with the last PDF attached. */}
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

            <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                {loading && (
                    <div className="text-center text-soft-text text-sm py-10">
                        Chargement...
                    </div>
                )}

                {!loading && order && (
                    <div className="grid grid-cols-3 gap-4 max-w-[1400px] mx-auto">
                        <div className="col-span-2 flex flex-col gap-4">
                            {/* Editable lines panel: ajout/modification/
                                suppression directement depuis la page détail.
                                Le mode read-only (DocumentLinesTable
                                catalog-driven) reste exporté pour les pages
                                qui n'ont pas besoin d'édition. */}
                            <DocumentLinesEditor
                                docId={Number(order.id)}
                                lines={order.lines ?? []}
                                dataSource={dataSource}
                                onChange={(updated) => {
                                    if (updated && typeof setSupplierOrder === "function") {
                                        setSupplierOrder(updated);
                                    }
                                }}
                                readOnly={order.statut !== 0}
                            />
                            {/* Generated PDFs + attached uploads (task 4). */}
                            <DocumentsSection
                                objectType="supplier_order"
                                objectId={Number(order.id)}
                                refreshKey={order.lastMainDoc || ""}
                            />
                        </div>

                        <aside className="col-span-1 flex flex-col gap-4">
                            <DocumentHeaderFields
                                object={order}
                                feature="supplierorder"
                                dataSource={dataSource}
                                storageKey="dolipocket.supplierorderpage.header"
                                title="Informations"
                                overrides={HEADER_OVERRIDES}
                            />

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <TotalRow label="Total HT"  value={`${fmtAmount(order.totalHt)} EUR`} />
                                    <TotalRow label="TVA"       value={`${fmtAmount(order.totalTva)} EUR`} />
                                    <TotalRow label="Total TTC" value={`${fmtAmount(order.totalTtc)} EUR`} strong />
                                </div>
                            </section>

                            {(order.notePublic || order.notePrivate) && (
                                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                    <header className="px-4 py-2.5 border-b border-soft-border">
                                        <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                                    </header>
                                    <div className="px-4 py-3 space-y-3 text-[13px]">
                                        {order.notePublic && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Publique</div>
                                                <div className="whitespace-pre-wrap text-strong-text">{order.notePublic}</div>
                                            </div>
                                        )}
                                        {order.notePrivate && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Privée</div>
                                                <div className="whitespace-pre-wrap text-strong-text">{order.notePrivate}</div>
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
            docLabel="commande fournisseur"
        />
        </>
    );
};
