import {
    FaArrowLeft, FaPen, FaCheck, FaTrash, FaFilePdf, FaPaperPlane, FaCreditCard, FaDownload,
} from "react-icons/fa6";

import { DocumentLinesTable, DocumentHeaderFields } from "src/lib/datatable";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { AddPaymentModal } from "src/lib/components/AddPaymentModal";
import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

import { fmtAmount, fmtDate } from "./useInvoiceData";

// Default Dolibarr c_paiement entries (id from llx_c_paiement). These match
// the standard codes shipped with every fresh install and are stable across
// tenants. The picker stays usable even before we wire a sellist endpoint
// for c_paiement (todo, cf .claude/CLAUDE.md "Limitations connues" on
// sellists). When a project ships custom modes, an admin can extend the
// modal via a future <PaymentModePicker /> wired to a real endpoint.
const DEFAULT_PAYMENT_MODES = [
    { id: 2,  code: "VIR", label: "Virement" },
    { id: 4,  code: "CB",  label: "Carte bancaire" },
    { id: 3,  code: "CHQ", label: "Chèque" },
    { id: 1,  code: "LIQ", label: "Espèces" },
    { id: 6,  code: "PRE", label: "Prélèvement" },
    { id: 7,  code: "VAD", label: "Paiement à distance" },
];

// Desktop rendering of the invoice detail page. Dolibarr-style layout :
// - Sticky top action bar (Back / Title / Status / Actions)
// - 2 columns : Lines (catalog-driven) + side rail (Informations
//               catalog-driven + Totaux + Paiements + Notes hardcoded).
//
// Strict adherence to .claude/CLAUDE.md "Conventions UI desktop épurées".

// Wrapper that maps the boolean `paid` flag to a <StatusPill> label
// override -- keeps the historical PaymentPill shape used inline below.
const PaymentPill = ({ paid }) => (
    paid
        ? <StatusPill label="Payée" tone="emerald" />
        : <StatusPill label="Impayée" tone="amber" />
);

const TotalRow = ({ label, value, strong = false, accent = "" }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-[13px] ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={`${strong ? "font-semibold" : ""} ${accent || "text-strong-text"}`}>{value}</span>
    </div>
);

const HEADER_OVERRIDES = {
    ref:              { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:        { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:            { defaultVisible: true,  formatter: (v) => v ? `#${v}` : "-" },
    datef:            { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    dateLimReglement: { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    statut:           { defaultVisible: true,  formatter: (v) => getStatusInfo("invoice", v).label },
    paye:             { defaultVisible: true,  formatter: (v) => Number(v) === 1 ? "Payée" : "Impayée" },
    closeCode:        { defaultVisible: false, formatter: (v) => v ?? "-" },
    totalHt:          { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
    totalTtc:         { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
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

export const InvoicePageDesktop = (props) => {
    const {
        invoice, loading, error, actionPending,
        isDraft, isPaid,
        handleValidate, handleDelete,
        handleGeneratePdf,
        handleDownloadPdf,
        hasLastMainDoc,
        goEdit, goBack,
        dataSource,
        setInvoice,
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
        paymentOpen, openPayment, closePayment, submitPayment,
    } = props;

    // The "Enregistrer paiement" button is only relevant for an invoice that
    // is validated (statut >= 1) and not yet fully paid. Mirrors the
    // Dolibarr core "Faire un paiement" button on /compta/facture/card.php.
    const canPay = !!invoice && Number(invoice.statut) >= 1 && !isPaid;
    const remainToPay = Number(invoice?.remainToPay ?? invoice?.totalTtc ?? 0);

    const defaultRecipient = invoice?.thirdparty?.email
        ?? invoice?.socEmail
        ?? invoice?.email
        ?? "";
    const refLabel = invoice?.ref ? invoice.ref : `#${invoice?.id ?? ""}`;
    const defaultSubject = `Facture ${refLabel}`.trim();
    const defaultBody = `Bonjour,\n\nVeuillez trouver ci-joint la facture ${refLabel}.\n\nCordialement.`;

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
                    {loading ? "Chargement..." : (invoice?.ref || "Facture")}
                </h1>
                {!loading && invoice && (
                    <>
                        <StatusPill feature="invoice" status={invoice.statut} />
                        <PaymentPill paid={isPaid} />
                    </>
                )}

                <span className="flex-1" />

                {!loading && invoice && (
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
                        {/* Send the invoice by email with the last PDF attached. */}
                        <button
                            type="button"
                            onClick={openSendEmail}
                            disabled={actionPending}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            <FaPaperPlane className="text-[11px]" />
                            <span>Envoyer</span>
                        </button>
                        {/* Record a customer payment against the invoice
                            (statut>=1 and not yet fully paid). */}
                        {canPay && (
                            <button
                                type="button"
                                onClick={openPayment}
                                disabled={actionPending}
                                className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                                <FaCreditCard className="text-[11px]" />
                                <span>Enregistrer paiement</span>
                            </button>
                        )}
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

                {!loading && invoice && (
                    <div className="grid grid-cols-3 gap-4 max-w-[1400px] mx-auto">
                        <div className="col-span-2 flex flex-col gap-4">
                            {/* Editable lines panel: ajout/modification/
                                suppression directement depuis la page détail.
                                Le mode read-only (DocumentLinesTable
                                catalog-driven) reste exporté pour les pages
                                qui n'ont pas besoin d'édition. */}
                            <DocumentLinesEditor
                                docId={Number(invoice.id)}
                                lines={invoice.lines ?? []}
                                dataSource={dataSource}
                                onChange={(updated) => {
                                    if (updated && typeof setInvoice === "function") {
                                        setInvoice(updated);
                                    }
                                }}
                                readOnly={invoice.statut !== 0}
                            />
                            {/* Generated PDFs + attached uploads (task 4). */}
                            <DocumentsSection
                                objectType="invoice"
                                objectId={Number(invoice.id)}
                                refreshKey={invoice.lastMainDoc || ""}
                            />
                        </div>

                        <aside className="col-span-1 flex flex-col gap-4">
                            <DocumentHeaderFields
                                object={invoice}
                                feature="invoice"
                                dataSource={dataSource}
                                storageKey="dolipocket.invoicepage.header"
                                title="Informations"
                                overrides={HEADER_OVERRIDES}
                            />

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border">
                                    <h2 className="text-sm font-semibold text-strong-text">Totaux</h2>
                                </header>
                                <div className="px-4 py-2">
                                    <TotalRow label="Total HT"  value={`${fmtAmount(invoice.totalHt)} EUR`} />
                                    <TotalRow label="TVA"       value={`${fmtAmount(invoice.totalTva)} EUR`} />
                                    <TotalRow label="Total TTC" value={`${fmtAmount(invoice.totalTtc)} EUR`} strong />
                                </div>
                            </section>

                            <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                <header className="px-4 py-2.5 border-b border-soft-border flex items-center justify-between">
                                    <h2 className="text-sm font-semibold text-strong-text">Paiements</h2>
                                    {Array.isArray(invoice.payments) && (
                                        <span className="text-xs text-soft-text">{invoice.payments.length}</span>
                                    )}
                                </header>
                                <div className="px-4 py-2">
                                    {(!invoice.payments || invoice.payments.length === 0) && (
                                        <div className="py-2 text-[13px] text-soft-text italic">
                                            Aucun paiement enregistré
                                        </div>
                                    )}
                                    {invoice.payments && invoice.payments.length > 0 && (
                                        <div className="divide-y divide-soft-border/60">
                                            {invoice.payments.map((p, idx) => (
                                                <div key={idx} className="flex justify-between gap-3 py-1.5 text-[13px]">
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-strong-text truncate">{p.ref || p.type || "-"}</div>
                                                        <div className="text-xs text-soft-text">{fmtDate(p.date)}</div>
                                                    </div>
                                                    <div className="text-right font-semibold text-strong-text">
                                                        {fmtAmount(p.amount)} EUR
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <TotalRow label="Total payé" value={`${fmtAmount(invoice.totalPaid)} EUR`} accent="text-emerald-700" />
                                    <TotalRow label="Reste à payer" value={`${fmtAmount(invoice.remainToPay)} EUR`} strong accent={isPaid ? "text-emerald-700" : "text-amber-700"} />
                                </div>
                            </section>

                            {(invoice.notePublic || invoice.notePrivate) && (
                                <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                                    <header className="px-4 py-2.5 border-b border-soft-border">
                                        <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                                    </header>
                                    <div className="px-4 py-3 space-y-3 text-[13px]">
                                        {invoice.notePublic && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Publique</div>
                                                <div className="whitespace-pre-wrap text-strong-text">
                                                    {invoice.notePublic}
                                                </div>
                                            </div>
                                        )}
                                        {invoice.notePrivate && (
                                            <div>
                                                <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Privée</div>
                                                <div className="whitespace-pre-wrap text-strong-text">
                                                    {invoice.notePrivate}
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
            docLabel="facture"
        />

        <AddPaymentModal
            open={!!paymentOpen}
            onClose={closePayment}
            onSubmit={submitPayment}
            defaultAmount={remainToPay}
            currencyLabel="EUR"
            paymentModes={DEFAULT_PAYMENT_MODES}
            defaultPaymentMode={4}
            docLabel="facture"
        />
        </>
    );
};
