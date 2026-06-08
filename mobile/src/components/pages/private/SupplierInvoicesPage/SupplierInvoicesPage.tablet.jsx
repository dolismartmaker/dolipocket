import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaPen, FaCheck, FaTrash, FaFilePdf, FaPaperPlane, FaCreditCard, FaDownload,
} from "react-icons/fa6";

import { useConfirm } from "@cap-rel/smartcommon";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";
import { useMenu } from "src/lib/permissions";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { DocumentHeaderFields } from "src/lib/datatable";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { AddPaymentModal } from "src/lib/components/AddPaymentModal";
import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";
import { MasterDetailLayout, EmptyDetail, TouchList, TouchListItem } from "src/lib/tablet";

import { useSupplierInvoiceData, fmtAmount, fmtDate } from "../SupplierInvoicePage/useSupplierInvoiceData";

// Tablet master-detail workspace for Supplier Invoices (factures fournisseur).
// Document feature: the detail pane reuses the full useSupplierInvoiceData()
// workflow (validate / PDF / email / payment) -- only the presentation is
// touch-first and single column. DocumentLinesEditor auto-renders its touch
// (cards) variant on tablet.

// Default Dolibarr c_paiement entries -- same canonical list as the desktop
// supplier invoice page.
const DEFAULT_PAYMENT_MODES = [
    { id: 2, code: "VIR", label: "Virement" },
    { id: 4, code: "CB", label: "Carte bancaire" },
    { id: 3, code: "CHQ", label: "Chèque" },
    { id: 1, code: "LIQ", label: "Espèces" },
    { id: 6, code: "PRE", label: "Prélèvement" },
];

const HEADER_OVERRIDES = {
    ref:              { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refSupplier:      { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:            { defaultVisible: true,  formatter: (v, row) => row?.thirdpartyName || (v ? `#${v}` : "-") },
    libelle:          { defaultVisible: true,  formatter: (v) => v ?? "-" },
    datef:            { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    dateLimReglement: { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    statut:           { defaultVisible: true,  formatter: (v) => getStatusInfo("supplierinvoice", v).label },
    paye:             { defaultVisible: true,  formatter: (v) => Number(v) === 1 ? "Payée" : "Impayée" },
    totalHt:          { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
    totalTtc:         { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
};

// Touch action button. Tone drives the colour; every button is >= 44px tall.
const ActionBtn = ({ onClick, disabled, icon: Icon, label, tone = "neutral" }) => {
    const toneClass = {
        primary: "bg-primary text-white",
        success: "bg-emerald-600 text-white",
        slate: "bg-slate-700 text-white",
        blue: "bg-blue-600 text-white",
        danger: "bg-white border border-red-200 text-red-600",
        neutral: "bg-white border border-soft-border text-strong-text",
    }[tone];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`h-11 px-3.5 rounded-lg text-sm font-medium flex items-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 ${toneClass}`}
        >
            {Icon && <Icon className="text-sm" />}
            <span>{label}</span>
        </button>
    );
};

// Maps the boolean paid flag to a label-override pill (same shape as the
// desktop PaymentPill).
const PaymentPill = ({ paid }) => (
    paid
        ? <StatusPill label="Payée" tone="emerald" />
        : <StatusPill label="Impayée" tone="amber" />
);

const TotalRow = ({ label, value, strong = false, accent = "" }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={`${strong ? "font-semibold" : ""} ${accent || "text-strong-text"}`}>{value}</span>
    </div>
);

// Detail pane: mounted only when an invoice is selected, so
// useSupplierInvoiceData(id) always has a valid id. Delete is overridden
// locally (the hook's handleDelete navigates, which would break the in-pane
// flow) to clear the selection and refresh the list instead.
const SupplierInvoiceTabletDetail = ({ id, onDeleted }) => {
    const { confirm } = useConfirm() ?? {};
    const data = useSupplierInvoiceData(id);
    const {
        invoice, loading, error, actionPending,
        statut, isDraft, isPaid,
        handleValidate,
        handleGeneratePdf, handleDownloadPdf,
        hasLastMainDoc, goEdit, dataSource, setSupplierInvoice,
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
        paymentOpen, openPayment, closePayment, submitPayment,
    } = data;

    const [deleting, setDeleting] = useState(false);

    const handleLocalDelete = async () => {
        const ok = confirm
            ? await confirm({
                  type: "delete",
                  title: "Supprimer cette facture fournisseur ?",
                  message: "Cette action est irréversible.",
                  confirmText: "Supprimer",
                  cancelText: "Annuler",
              })
            : window.confirm("Supprimer cette facture fournisseur ?");
        if (!ok) return;
        setDeleting(true);
        try {
            await dataSource.remove(id);
            onDeleted?.();
        } catch (err) {
            console.error("[SupplierInvoiceTabletDetail] remove error", err);
            setDeleting(false);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Chargement...</div>;
    }
    if (error) {
        return <div className="h-full flex items-center justify-center text-sm text-red-600">{error}</div>;
    }
    if (!invoice) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Aucune donnée</div>;
    }

    const payments = Array.isArray(invoice?.payments) ? invoice.payments : [];
    const remain = Number(invoice?.remainToPay ?? 0);
    const canPay = Number(invoice?.statut ?? 0) >= 1 && !isPaid;

    const refLabel = invoice?.ref ? invoice.ref : `#${invoice?.id ?? ""}`;
    const defaultRecipient = invoice?.thirdparty?.email ?? invoice?.socEmail ?? invoice?.email ?? "";
    const pending = actionPending || deleting;

    return (
        <div className="min-h-full bg-medium-bg">
            {/* Sticky touch header */}
            <header className="sticky top-0 z-10 bg-white border-b border-soft-border px-4 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-base font-bold text-strong-text truncate">{invoice.ref || "Facture fournisseur"}</h1>
                    <StatusPill feature="supplierinvoice" status={statut} />
                    <PaymentPill paid={isPaid} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {isDraft && <ActionBtn onClick={goEdit} disabled={pending} icon={FaPen} label="Modifier" tone="neutral" />}
                    {isDraft && <ActionBtn onClick={handleValidate} disabled={pending} icon={FaCheck} label="Valider" tone="primary" />}
                    <ActionBtn onClick={handleGeneratePdf} disabled={pending} icon={FaFilePdf} label="Générer PDF" tone="slate" />
                    {hasLastMainDoc && <ActionBtn onClick={handleDownloadPdf} disabled={pending} icon={FaDownload} label="Télécharger PDF" tone="neutral" />}
                    <ActionBtn onClick={openSendEmail} disabled={pending} icon={FaPaperPlane} label="Envoyer" tone="blue" />
                    {canPay && <ActionBtn onClick={openPayment} disabled={pending} icon={FaCreditCard} label="Enregistrer paiement" tone="success" />}
                    <ActionBtn onClick={handleLocalDelete} disabled={pending} icon={FaTrash} label="Supprimer" tone="danger" />
                </div>
            </header>

            {error && (
                <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
            )}

            {/* Single-column stacked body */}
            <div className="p-4 space-y-4 max-w-4xl">
                <DocumentLinesEditor
                    docId={Number(invoice.id)}
                    lines={invoice.lines ?? []}
                    dataSource={dataSource}
                    onChange={(updated) => { if (updated && typeof setSupplierInvoice === "function") setSupplierInvoice(updated); }}
                    readOnly={invoice.statut !== 0}
                />

                <DocumentHeaderFields
                    object={invoice}
                    feature="supplierinvoice"
                    dataSource={dataSource}
                    storageKey="dolipocket.supplierinvoice.tablet.header"
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
                        <span className="text-xs text-soft-text">{payments.length}</span>
                    </header>
                    <div className="px-4 py-2">
                        {payments.length === 0 && (
                            <div className="py-2 text-sm text-soft-text italic">
                                Aucun paiement enregistré
                            </div>
                        )}
                        {payments.length > 0 && (
                            <div className="divide-y divide-soft-border/60">
                                {payments.map((p, idx) => (
                                    <div key={p.id ?? idx} className="flex justify-between gap-3 py-1.5 text-sm">
                                        <div className="min-w-0">
                                            <div className="font-medium text-strong-text truncate">
                                                {p.modeLabel || p.modeCode || "Paiement"}
                                            </div>
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
                        <TotalRow label="Reste à payer" value={`${fmtAmount(remain)} EUR`} strong accent={isPaid ? "text-emerald-700" : "text-amber-700"} />
                    </div>
                </section>

                {(invoice.notePublic || invoice.notePrivate) && (
                    <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
                        <header className="px-4 py-2.5 border-b border-soft-border">
                            <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
                        </header>
                        <div className="px-4 py-3 space-y-3 text-sm">
                            {invoice.notePublic && (
                                <div>
                                    <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Publique</div>
                                    <div className="whitespace-pre-wrap text-strong-text">{invoice.notePublic}</div>
                                </div>
                            )}
                            {invoice.notePrivate && (
                                <div>
                                    <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Privée</div>
                                    <div className="whitespace-pre-wrap text-strong-text">{invoice.notePrivate}</div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                <DocumentsSection
                    objectType="supplier_invoice"
                    objectId={Number(invoice.id)}
                    refreshKey={invoice.lastMainDoc || ""}
                />
            </div>

            <SendEmailModal
                open={!!sendEmailOpen}
                onClose={closeSendEmail}
                onSend={submitSendEmail}
                defaultTo={defaultRecipient}
                defaultSubject={`Facture fournisseur ${refLabel}`.trim()}
                defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint la facture fournisseur ${refLabel}.\n\nCordialement.`}
                defaultAttachment=""
                docLabel="facture fournisseur"
            />

            <AddPaymentModal
                open={!!paymentOpen}
                onClose={closePayment}
                onSubmit={submitPayment}
                defaultAmount={remain}
                currencyLabel="EUR"
                paymentModes={DEFAULT_PAYMENT_MODES}
                defaultPaymentMode={2}
                docLabel="facture fournisseur"
            />
        </div>
    );
};

const renderItem = (f) => (
    <TouchListItem
        primary={f.ref || `#${f.id}`}
        secondary={f.refSupplier || ""}
        amount={`${fmtAmount(f.totalTtc)} EUR`}
        badge={<StatusPill feature="supplierinvoice" status={f.statut} paid={Number(f.paye) === 1} />}
    />
);

export const SupplierInvoicesWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbSupplierInvoices();
    const { has } = useMenu();

    const [selectedId, setSelectedId] = useState(initialId);
    const [reloadToken, setReloadToken] = useState(0);

    const load = useCallback(({ q }) => db.list({ q, perPage: 200 }), [db]);

    // The supplier-invoice list endpoint has no server-side `q` filter (its
    // indexLegacy ignores it), so we filter the loaded rows client-side, like
    // the customer invoices / orders workspaces.
    const filterItem = useCallback(
        (f, qLower) =>
            (f.ref || "").toLowerCase().includes(qLower)
            || (f.refSupplier || "").toLowerCase().includes(qLower),
        [],
    );

    return (
        <MasterDetailLayout
            master={
                <TouchList
                    title="Factures fournisseur"
                    searchPlaceholder="Rechercher une facture..."
                    load={load}
                    filterItem={filterItem}
                    reloadToken={reloadToken}
                    getKey={(f) => f.id}
                    renderItem={renderItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("supplierinvoice.create") ? () => navigate("/supplier-invoices/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <SupplierInvoiceTabletDetail
                        key={selectedId}
                        id={selectedId}
                        onDeleted={() => { setSelectedId(null); setReloadToken((t) => t + 1); }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez une facture" hint="Choisissez une facture fournisseur dans la liste pour voir son détail." />
                )
            }
        />
    );
};
