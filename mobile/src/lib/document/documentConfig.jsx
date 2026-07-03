import {
    FaCheck, FaCreditCard, FaPen, FaFilePdf, FaPaperPlane, FaRotateLeft,
    FaCircleCheck, FaBan, FaDownload, FaRepeat, FaTags, FaCopy, FaTrash,
    FaCircleInfo, FaFolderOpen, FaAddressCard, FaLink, FaNoteSticky,
    FaFileInvoiceDollar, FaXmark, FaMoneyBillWave, FaTruck, FaTruckFast,
    FaTruckRampBox, FaThumbsUp, FaThumbsDown, FaLockOpen, FaFileInvoice,
} from "react-icons/fa6";

import { DocumentHeaderFields } from "src/lib/datatable";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { DocumentContactsSection } from "src/lib/components/DocumentContactsSection";
import { DocumentLinksSection } from "src/lib/components/DocumentLinksSection";
import { CreditNotesSection } from "src/lib/components/CreditNotesSection";
import { AvailableDiscountsSection } from "src/lib/components/AvailableDiscountsSection";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { AddPaymentModal } from "src/lib/components/AddPaymentModal";
import { RecurringTemplateModal } from "src/lib/components/RecurringTemplateModal";
import { DepositInvoiceModal } from "src/lib/components/DepositInvoiceModal";
import { getStatusInfo } from "src/lib/components/StatusPill";

import { noteToText } from "src/lib/utils/htmlText";

import { fmtMoney, fmtDateFr, baseTotalsRows } from "./DocumentDetailShell/format";
import { TotalRow } from "./DocumentDetailShell/InspectorRail";

// Per-feature descriptors consumed by <DocumentDetailShell>. Each descriptor is
// pure data + small accessor/render functions; it carries ALL the per-document
// variation (status workflow, summary fields, commercial flow, inspector tabs,
// modals) so the page wrapper is a one-liner. Lot 1 ships INVOICE; the five
// other documents follow in lot 2 using the same shape.

// -----------------------------------------------------------------------------
// Invoice (Facture client)
// -----------------------------------------------------------------------------

// Default Dolibarr c_paiement entries (stable codes shipped with every install).
const DEFAULT_PAYMENT_MODES = [
    { id: 2, code: "VIR", label: "Virement" },
    { id: 4, code: "CB",  label: "Carte bancaire" },
    { id: 3, code: "CHQ", label: "Chèque" },
    { id: 1, code: "LIQ", label: "Espèces" },
    { id: 6, code: "PRE", label: "Prélèvement" },
    { id: 7, code: "VAD", label: "Paiement à distance" },
];

// "Convertir en remise" eligibility, mirroring compta/facture/card.php
// ($canconvert is re-checked server-side):
//   - credit note (type 2) : validated and not refunded
//   - deposit (type 3)     : validated
//   - standard (type 0)    : validated, unpaid, with excess received (remain < 0)
const canConvertToReduc = (o) => {
    const paid = Number(o.paye) === 1;
    const t = Number(o.type ?? 0);
    return Number(o.statut) >= 1 && (
        (t === 2 && !paid)
        || (t === 3)
        || (t === 0 && !paid && Number(o.remainToPay ?? 0) < 0)
    );
};

const INVOICE_HEADER_OVERRIDES = {
    ref:              { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:        { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:            { defaultVisible: true,  formatter: (v) => (v ? `#${v}` : "-") },
    datef:            { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    dateLimReglement: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    statut:           { defaultVisible: true,  formatter: (v) => getStatusInfo("invoice", v).label },
    paye:             { defaultVisible: true,  formatter: (v) => (Number(v) === 1 ? "Payée" : "Impayée") },
    closeCode:        { defaultVisible: false, formatter: (v) => v ?? "-" },
    totalHt:          { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:         { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

const InvoicePaymentsPanel = ({ object }) => {
    const payments = Array.isArray(object.payments) ? object.payments : [];
    const paid = Number(object.paye) === 1;
    return (
        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
            <header className="px-4 py-2.5 border-b border-soft-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-strong-text">Paiements</h2>
                <span className="text-xs text-soft-text">{payments.length}</span>
            </header>
            <div className="px-4 py-2">
                {payments.length === 0 && (
                    <div className="py-2 text-[13px] text-soft-text italic">Aucun paiement enregistré</div>
                )}
                {payments.length > 0 && (
                    <div className="divide-y divide-soft-border/60">
                        {payments.map((p, idx) => (
                            <div key={idx} className="flex justify-between gap-3 py-1.5 text-[13px]">
                                <div className="min-w-0">
                                    <div className="font-medium text-strong-text truncate">{p.modeLabel || p.modeCode || p.ref || p.type || "Paiement"}</div>
                                    <div className="text-xs text-soft-text">{fmtDateFr(p.date)}</div>
                                </div>
                                <div className="text-right font-semibold text-strong-text">{fmtMoney(p.amount)}</div>
                            </div>
                        ))}
                    </div>
                )}
                <TotalRow label="Total payé" value={fmtMoney(object.totalPaid)} accent="text-emerald-700" />
                <TotalRow
                    label="Reste à payer"
                    value={fmtMoney(object.remainToPay)}
                    strong
                    accent={paid ? "text-emerald-700" : "text-amber-700"}
                />
            </div>
        </section>
    );
};

const NotesPanel = ({ object }) => {
    const hasNotes = object.notePublic || object.notePrivate;
    return (
        <section className="bg-white rounded-xl border border-soft-border overflow-hidden">
            <header className="px-4 py-2.5 border-b border-soft-border">
                <h2 className="text-sm font-semibold text-strong-text">Notes</h2>
            </header>
            <div className="px-4 py-3 space-y-3 text-[13px]">
                {!hasNotes && <div className="text-soft-text italic">Aucune note</div>}
                {object.notePublic && (
                    <div>
                        <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Publique</div>
                        <div className="whitespace-pre-wrap text-strong-text">{noteToText(object.notePublic)}</div>
                    </div>
                )}
                {object.notePrivate && (
                    <div>
                        <div className="text-xs text-soft-text uppercase tracking-wider mb-1">Privée</div>
                        <div className="whitespace-pre-wrap text-strong-text">{noteToText(object.notePrivate)}</div>
                    </div>
                )}
            </div>
        </section>
    );
};

export const INVOICE_CONFIG = {
    feature: "invoice",
    objectKey: "invoice",
    label: "Facture",
    backLabel: "Retour aux factures",
    icon: FaFileInvoiceDollar,
    title: (o) => o?.ref || "Facture",
    setObject: (d) => d.setInvoice,
    newTitle: "Nouvelle facture",
    editFields: {
        create: ["fk_soc", "ref_client", "datef", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
        update: ["ref_client", "datef", "date_lim_reglement", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
    },

    pills: (o) => [
        { feature: "invoice", status: o.statut },
        { label: Number(o.paye) === 1 ? "Payée" : "Impayée", tone: Number(o.paye) === 1 ? "emerald" : "amber" },
    ],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname, ref: o.refClient, refLabel: "Réf. client" }),
        dates: (o) => [
            { label: "Date", value: fmtDateFr(o.datef) },
            { label: "Échéance", value: fmtDateFr(o.dateLimReglement) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
        payment: (o) => ({
            paid: o.totalPaid,
            total: o.totalTtc,
            remain: o.remainToPay,
            isPaid: Number(o.paye) === 1,
        }),
    },

    flow: {
        steps: [
            { key: "propal",   label: "Devis",    match: ["propal"],   route: "/proposals" },
            { key: "commande", label: "Commande", match: ["commande"], route: "/orders" },
            { key: "self",     label: "Facture",  self: true },
            { key: "payment",  label: "Paiement", payment: true },
        ],
        payment: (o) => {
            const paid = Number(o.paye) === 1;
            const n = Array.isArray(o.payments) ? o.payments.length : 0;
            return { sub: paid ? "Soldée" : (n > 0 ? `${n} paiement${n > 1 ? "s" : ""}` : "Aucun"), done: paid };
        },
    },

    sideRail: {
        totalsRows: (o) => baseTotalsRows(o),
    },

    actions: [
        // Contextual primary CTA (mutually exclusive predicates).
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "pay", label: "Enregistrer paiement", icon: FaCreditCard, tone: "success", group: "primary",
          visible: (o) => Number(o.statut) >= 1 && Number(o.paye) !== 1, run: (d) => d.openPayment },

        // Common secondary buttons.
        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },
        { id: "genpdf", label: "Générer PDF", icon: FaFilePdf, tone: "slate", group: "common",
          run: (d) => d.handleGeneratePdf },
        { id: "send", label: "Envoyer", icon: FaPaperPlane, tone: "info", group: "common",
          run: (d) => d.openSendEmail },

        // Status transitions (overflow).
        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetDraft },
        { id: "setpaid", label: "Classer payée", icon: FaCircleCheck, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetPaid },
        { id: "setcanceled", label: "Classer abandonnée", icon: FaBan, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetCanceled },
        { id: "setunpaid", label: "Repasser en impayée", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 2 || Number(o.statut) === 3, run: (d) => d.handleSetUnpaid },

        // Documents / conversion (overflow).
        { id: "dlpdf", label: "Télécharger PDF", icon: FaDownload, group: "convert",
          visible: (o, d) => d.hasLastMainDoc, run: (d) => d.handleDownloadPdf },
        { id: "recurring", label: "Modèle récurrent", icon: FaRepeat, group: "convert",
          visible: (o) => Number(o.statut) >= 1, run: (d) => () => d.setRecurringOpen(true) },
        { id: "convreduc", label: "Convertir en remise", icon: FaTags, group: "convert",
          visible: (o) => canConvertToReduc(o), run: (d) => d.handleConvertToReduc },
        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert",
          run: (d) => d.handleClone },

        // Danger zone (overflow).
        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          run: (d) => d.handleDelete },
    ],

    tabs: [
        { id: "info", label: "Informations", icon: FaCircleInfo,
          render: ({ object, data }) => (
              <DocumentHeaderFields
                  object={object}
                  feature="invoice"
                  dataSource={data.dataSource}
                  storageKey="dolipocket.invoicepage.header"
                  title="Informations"
                  overrides={INVOICE_HEADER_OVERRIDES}
              />
          ) },
        { id: "documents", label: "Documents", icon: FaFolderOpen,
          render: ({ object }) => (
              <DocumentsSection objectType="invoice" objectId={Number(object.id)} refreshKey={object.lastMainDoc || ""} />
          ) },
        { id: "contacts", label: "Contacts", icon: FaAddressCard,
          render: ({ object, data }) => (
              <DocumentContactsSection docId={Number(object.id)} dataSource={data.dataSource} />
          ) },
        { id: "links", label: "Objets liés", icon: FaLink,
          render: ({ object, data }) => (
              <DocumentLinksSection docId={Number(object.id)} dataSource={data.dataSource} />
          ) },
        { id: "payments", label: "Paiements", icon: FaCreditCard,
          badge: (o) => (Array.isArray(o.payments) && o.payments.length ? o.payments.length : null),
          render: ({ object }) => <InvoicePaymentsPanel object={object} /> },
        { id: "discounts", label: "Avoirs / remises", icon: FaTags,
          render: ({ object, data }) => (
              <div className="flex flex-col gap-4">
                  <CreditNotesSection invoiceId={Number(object.id)} dataSource={data.dataSource} />
                  <AvailableDiscountsSection
                      invoice={object}
                      dataSource={data.dataSource}
                      onChange={(updated) => {
                          if (updated && typeof data.setInvoice === "function") data.setInvoice(updated);
                      }}
                  />
              </div>
          ) },
        { id: "notes", label: "Notes", icon: FaNoteSticky,
          render: ({ object }) => <NotesPanel object={object} /> },
    ],

    renderModals: (data) => {
        const o = data.invoice;
        if (!o) return null;
        const refLabel = o.ref ? o.ref : `#${o.id ?? ""}`;
        return (
            <>
                <SendEmailModal
                    open={!!data.sendEmailOpen}
                    onClose={data.closeSendEmail}
                    onSend={data.submitSendEmail}
                    defaultTo={o.socEmail || ""}
                    defaultSubject={`Facture ${refLabel}`.trim()}
                    defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint la facture ${refLabel}.\n\nCordialement.`}
                    defaultAttachment={o.lastMainDoc || ""}
                    docLabel="facture"
                />
                <AddPaymentModal
                    open={!!data.paymentOpen}
                    onClose={data.closePayment}
                    onSubmit={data.submitPayment}
                    defaultAmount={Number(o.remainToPay ?? o.totalTtc ?? 0)}
                    currencyLabel="EUR"
                    paymentModes={DEFAULT_PAYMENT_MODES}
                    defaultPaymentMode={4}
                    docLabel="facture"
                />
                <RecurringTemplateModal
                    open={!!data.recurringOpen}
                    onClose={() => data.setRecurringOpen(false)}
                    invoiceId={Number(o.id)}
                    invoiceRef={o.ref || ""}
                />
            </>
        );
    },
};

// -----------------------------------------------------------------------------
// Shared inspector tab factories (reused by the non-invoice documents).
// -----------------------------------------------------------------------------

const infoTab = (feature, storageKey, overrides) => ({
    id: "info", label: "Informations", icon: FaCircleInfo,
    render: ({ object, data }) => (
        <DocumentHeaderFields
            object={object}
            feature={feature}
            dataSource={data.dataSource}
            storageKey={storageKey}
            title="Informations"
            overrides={overrides}
        />
    ),
});
const documentsTab = (objectType) => ({
    id: "documents", label: "Documents", icon: FaFolderOpen,
    render: ({ object }) => (
        <DocumentsSection objectType={objectType} objectId={Number(object.id)} refreshKey={object.lastMainDoc || ""} />
    ),
});
const contactsTab = {
    id: "contacts", label: "Contacts", icon: FaAddressCard,
    render: ({ object, data }) => <DocumentContactsSection docId={Number(object.id)} dataSource={data.dataSource} />,
};
const linksTab = {
    id: "links", label: "Objets liés", icon: FaLink,
    render: ({ object, data }) => <DocumentLinksSection docId={Number(object.id)} dataSource={data.dataSource} />,
};
const notesTab = {
    id: "notes", label: "Notes", icon: FaNoteSticky,
    render: ({ object }) => <NotesPanel object={object} />,
};

// Generic "send by email" modal builder shared by the documents that support
// it (everything except the supplier price request).
const sendEmailModal = (data, object, { docLabel, subjectPrefix }) => {
    const refLabel = object.ref ? object.ref : `#${object.id ?? ""}`;
    return (
        <SendEmailModal
            open={!!data.sendEmailOpen}
            onClose={data.closeSendEmail}
            onSend={data.submitSendEmail}
            defaultTo={object.socEmail || ""}
            defaultSubject={`${subjectPrefix} ${refLabel}`.trim()}
            defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint ${docLabel} ${refLabel}.\n\nCordialement.`}
            defaultAttachment={object.lastMainDoc || ""}
            docLabel={docLabel}
        />
    );
};

// -----------------------------------------------------------------------------
// Proposal (Devis)
// -----------------------------------------------------------------------------

const PROPOSAL_HEADER_OVERRIDES = {
    ref:         { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:   { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:       { defaultVisible: true,  formatter: (v) => (v ? `#${v}` : "-") },
    datep:       { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    finValidite: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    statut:      { defaultVisible: true,  formatter: (v) => getStatusInfo("proposal", v).label },
    totalHt:     { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:    { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

export const PROPOSAL_CONFIG = {
    feature: "proposal",
    objectKey: "proposal",
    label: "Devis",
    backLabel: "Retour aux devis",
    icon: FaFileInvoiceDollar,
    title: (o) => o?.ref || "Devis",
    setObject: (d) => d.setProposal,
    newTitle: "Nouveau devis",
    editFields: {
        create: ["fk_soc", "ref_client", "datep", "fin_validite", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
        update: ["ref_client", "datep", "fin_validite", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
    },

    pills: (o) => [{ feature: "proposal", status: o.statut }],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname, ref: o.refClient, refLabel: "Réf. client" }),
        dates: (o) => [
            { label: "Date", value: fmtDateFr(o.datep) },
            { label: "Validité", value: fmtDateFr(o.finValidite) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
    },

    flow: {
        steps: [
            { key: "self",     label: "Devis",    self: true },
            { key: "commande", label: "Commande", match: ["commande"], route: "/orders" },
            { key: "facture",  label: "Facture",  match: ["facture"],  route: "/invoices" },
        ],
    },

    sideRail: { totalsRows: (o) => baseTotalsRows(o) },

    actions: [
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "sign", label: "Signé", icon: FaCheck, tone: "success", group: "primary",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSign },
        { id: "toorder", label: "Créer une commande", icon: FaFileInvoice, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 2, run: (d) => d.handleConvertToOrder },

        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },
        { id: "genpdf", label: "Générer PDF", icon: FaFilePdf, tone: "slate", group: "common",
          run: (d) => d.handleGeneratePdf },
        { id: "send", label: "Envoyer", icon: FaPaperPlane, tone: "info", group: "common",
          run: (d) => d.openSendEmail },

        { id: "unsign", label: "Non signé", icon: FaXmark, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleUnsign },
        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetDraft },
        { id: "billed", label: "Classer facturé", icon: FaFileInvoiceDollar, group: "status",
          visible: (o) => Number(o.statut) === 2, run: (d) => d.handleClassifyBilled },

        { id: "deposit", label: "Facture d'acompte", icon: FaMoneyBillWave, group: "convert",
          visible: (o) => Number(o.statut) === 1 || Number(o.statut) === 2, run: (d) => () => d.setDepositOpen(true) },
        { id: "dlpdf", label: "Télécharger PDF", icon: FaDownload, group: "convert",
          visible: (o, d) => d.hasLastMainDoc, run: (d) => d.handleDownloadPdf },
        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert", run: (d) => d.handleClone },

        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          run: (d) => d.handleDelete },
    ],

    tabs: [
        infoTab("proposal", "dolipocket.proposalpage.header", PROPOSAL_HEADER_OVERRIDES),
        documentsTab("proposal"),
        contactsTab,
        linksTab,
        notesTab,
    ],

    renderModals: (data) => {
        const o = data.proposal;
        if (!o) return null;
        return (
            <>
                {sendEmailModal(data, o, { docLabel: "le devis", subjectPrefix: "Devis" })}
                <DepositInvoiceModal
                    open={!!data.depositOpen}
                    onClose={() => data.setDepositOpen(false)}
                    originType="propal"
                    originId={Number(o.id)}
                    originRef={o.ref || ""}
                />
            </>
        );
    },
};

// -----------------------------------------------------------------------------
// Order (Commande client)
// -----------------------------------------------------------------------------

const ORDER_HEADER_OVERRIDES = {
    ref:           { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:     { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:         { defaultVisible: true,  formatter: (v) => (v ? `#${v}` : "-") },
    dateCommande:  { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    dateLivraison: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    statut:        { defaultVisible: true,  formatter: (v) => getStatusInfo("order", v).label },
    totalHt:       { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:      { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

// A client order is "open" for actions while validated (1) or in progress (2).
const orderOpen = (o) => Number(o.statut) === 1 || Number(o.statut) === 2;

export const ORDER_CONFIG = {
    feature: "order",
    objectKey: "order",
    label: "Commande",
    backLabel: "Retour aux commandes",
    icon: FaFileInvoice,
    title: (o) => o?.ref || "Commande",
    setObject: (d) => d.setOrder,
    newTitle: "Nouvelle commande",
    editFields: {
        create: ["fk_soc", "ref_client", "date_commande", "date_livraison", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
        update: ["ref_client", "date_commande", "date_livraison", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
    },

    pills: (o) => [{ feature: "order", status: o.statut }],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname, ref: o.refClient, refLabel: "Réf. client" }),
        dates: (o) => [
            { label: "Date", value: fmtDateFr(o.dateCommande) },
            { label: "Livraison", value: fmtDateFr(o.dateLivraison) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
    },

    flow: {
        steps: [
            { key: "propal",  label: "Devis",    match: ["propal"],  route: "/proposals" },
            { key: "self",    label: "Commande", self: true },
            { key: "facture", label: "Facture",  match: ["facture"], route: "/invoices" },
        ],
    },

    sideRail: { totalsRows: (o) => baseTotalsRows(o) },

    actions: [
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "toinvoice", label: "Créer une facture", icon: FaFileInvoiceDollar, tone: "success", group: "primary",
          visible: orderOpen, run: (d) => d.handleConvertToInvoice },

        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },
        { id: "genpdf", label: "Générer PDF", icon: FaFilePdf, tone: "slate", group: "common",
          run: (d) => d.handleGeneratePdf },
        { id: "send", label: "Envoyer", icon: FaPaperPlane, tone: "info", group: "common",
          run: (d) => d.openSendEmail },

        { id: "ship", label: "Créer une expédition", icon: FaTruckFast, group: "convert",
          visible: orderOpen, run: (d) => d.goShip },
        { id: "deposit", label: "Facture d'acompte", icon: FaMoneyBillWave, group: "convert",
          visible: orderOpen, run: (d) => () => d.setDepositOpen(true) },

        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: orderOpen, run: (d) => d.handleSetDraft },
        { id: "close", label: "Classer livrée", icon: FaTruck, group: "status",
          visible: orderOpen, run: (d) => d.handleCloseOrder },
        { id: "billed", label: "Classer facturée", icon: FaFileInvoiceDollar, group: "status",
          visible: orderOpen, run: (d) => d.handleClassifyBilled },
        { id: "cancel", label: "Annuler la commande", icon: FaBan, group: "status",
          visible: orderOpen, run: (d) => d.handleCancelOrder },

        { id: "dlpdf", label: "Télécharger PDF", icon: FaDownload, group: "convert",
          visible: (o, d) => d.hasLastMainDoc, run: (d) => d.handleDownloadPdf },
        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert", run: (d) => d.handleClone },

        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          run: (d) => d.handleDelete },
    ],

    tabs: [
        infoTab("order", "dolipocket.orderpage.header", ORDER_HEADER_OVERRIDES),
        documentsTab("order"),
        contactsTab,
        linksTab,
        notesTab,
    ],

    renderModals: (data) => {
        const o = data.order;
        if (!o) return null;
        return (
            <>
                {sendEmailModal(data, o, { docLabel: "la commande", subjectPrefix: "Commande" })}
                <DepositInvoiceModal
                    open={!!data.depositOpen}
                    onClose={() => data.setDepositOpen(false)}
                    originType="commande"
                    originId={Number(o.id)}
                    originRef={o.ref || ""}
                />
            </>
        );
    },
};

// -----------------------------------------------------------------------------
// Supplier order (Commande fournisseur)
// -----------------------------------------------------------------------------

const SUPPLIER_ORDER_HEADER_OVERRIDES = {
    ref:           { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refSupplier:   { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:         { defaultVisible: true,  formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
    dateCommande:  { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    dateLivraison: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    statut:        { defaultVisible: true,  formatter: (v) => getStatusInfo("supplierorder", v).label },
    totalHt:       { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:      { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

export const SUPPLIER_ORDER_CONFIG = {
    feature: "supplierorder",
    objectKey: "order",
    label: "Commande fournisseur",
    backLabel: "Retour aux commandes fournisseur",
    icon: FaFileInvoice,
    title: (o) => o?.ref || "Commande fournisseur",
    setObject: (d) => d.setSupplierOrder,
    newTitle: "Nouvelle commande fournisseur",
    editFields: {
        create: ["fk_soc", "ref_supplier", "date_commande", "date_livraison", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
        update: ["fk_soc", "ref_supplier", "date_commande", "date_livraison", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
    },

    pills: (o) => [{ feature: "supplierorder", status: o.statut }],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname, ref: o.refSupplier, refLabel: "Réf. fournisseur" }),
        dates: (o) => [
            { label: "Date", value: fmtDateFr(o.dateCommande) },
            { label: "Livraison", value: fmtDateFr(o.dateLivraison) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
    },

    flow: {
        steps: [
            { key: "supplier_proposal", label: "Demande de prix", match: ["supplier_proposal"], route: "/supplier-proposals" },
            { key: "self",              label: "Cmd fournisseur",  self: true },
            { key: "invoice_supplier",  label: "Facture fourn.",   match: ["invoice_supplier", "facture_fourn"], route: "/supplier-invoices" },
        ],
    },

    sideRail: { totalsRows: (o) => baseTotalsRows(o) },

    actions: [
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "approve", label: "Approuver", icon: FaThumbsUp, tone: "success", group: "primary",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleApprove },
        { id: "order", label: "Commander", icon: FaTruck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 2, run: (d) => d.handleOrder },
        { id: "reception", label: "Créer une réception", icon: FaTruckRampBox, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 3 || Number(o.statut) === 4, run: (d) => d.goReception },

        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },
        { id: "genpdf", label: "Générer PDF", icon: FaFilePdf, tone: "slate", group: "common",
          run: (d) => d.handleGeneratePdf },
        { id: "send", label: "Envoyer", icon: FaPaperPlane, tone: "info", group: "common",
          run: (d) => d.openSendEmail },

        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetDraft },
        { id: "receive", label: "Classer reçue", icon: FaCheck, group: "status",
          visible: (o) => Number(o.statut) === 3 || Number(o.statut) === 4, run: (d) => d.handleReceive },

        { id: "facturer", label: "Facturer", icon: FaFileInvoiceDollar, group: "convert",
          visible: (o) => Number(o.statut) >= 3, run: (d) => d.handleConvertToInvoice },
        { id: "dlpdf", label: "Télécharger PDF", icon: FaDownload, group: "convert",
          visible: (o, d) => d.hasLastMainDoc, run: (d) => d.handleDownloadPdf },
        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert", run: (d) => d.handleClone },

        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          run: (d) => d.handleDelete },
    ],

    tabs: [
        infoTab("supplierorder", "dolipocket.supplierorderpage.header", SUPPLIER_ORDER_HEADER_OVERRIDES),
        documentsTab("supplier_order"),
        contactsTab,
        linksTab,
        notesTab,
    ],

    renderModals: (data) => {
        const o = data.order;
        if (!o) return null;
        return sendEmailModal(data, o, { docLabel: "la commande fournisseur", subjectPrefix: "Commande fournisseur" });
    },
};

// -----------------------------------------------------------------------------
// Supplier invoice (Facture fournisseur)
// -----------------------------------------------------------------------------

const SUPPLIER_PAYMENT_MODES = [
    { id: 2, code: "VIR", label: "Virement" },
    { id: 4, code: "CB",  label: "Carte bancaire" },
    { id: 3, code: "CHQ", label: "Chèque" },
    { id: 1, code: "LIQ", label: "Espèces" },
    { id: 6, code: "PRE", label: "Prélèvement" },
];

const SUPPLIER_INVOICE_HEADER_OVERRIDES = {
    ref:              { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refSupplier:      { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:            { defaultVisible: true,  formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
    libelle:          { defaultVisible: true,  formatter: (v) => v ?? "-" },
    datef:            { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    dateLimReglement: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    statut:           { defaultVisible: true,  formatter: (v) => getStatusInfo("supplierinvoice", v).label },
    paye:             { defaultVisible: true,  formatter: (v) => (Number(v) === 1 ? "Payée" : "Impayée") },
    totalHt:          { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:         { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

export const SUPPLIER_INVOICE_CONFIG = {
    feature: "supplierinvoice",
    objectKey: "invoice",
    label: "Facture fournisseur",
    backLabel: "Retour aux factures fournisseur",
    icon: FaFileInvoiceDollar,
    title: (o) => o?.ref || "Facture fournisseur",
    setObject: (d) => d.setSupplierInvoice,
    newTitle: "Nouvelle facture fournisseur",
    editFields: {
        create: ["fk_soc", "ref_supplier", "libelle", "datef", "date_lim_reglement", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
        update: ["fk_soc", "ref_supplier", "libelle", "datef", "date_lim_reglement", "fk_cond_reglement", "fk_mode_reglement", "note_public", "note_private"],
    },

    pills: (o) => [
        { feature: "supplierinvoice", status: o.statut },
        { label: Number(o.paye) === 1 ? "Payée" : "Impayée", tone: Number(o.paye) === 1 ? "emerald" : "amber" },
    ],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname, ref: o.refSupplier, refLabel: "Réf. fournisseur" }),
        dates: (o) => [
            { label: "Date", value: fmtDateFr(o.datef) },
            { label: "Échéance", value: fmtDateFr(o.dateLimReglement) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
        payment: (o) => ({
            paid: o.totalPaid,
            total: o.totalTtc,
            remain: o.remainToPay,
            isPaid: Number(o.paye) === 1,
        }),
    },

    flow: {
        steps: [
            { key: "order_supplier", label: "Cmd fournisseur", match: ["order_supplier", "commande_fournisseur"], route: "/supplier-orders" },
            { key: "self",           label: "Facture fourn.",  self: true },
            { key: "payment",        label: "Paiement",        payment: true },
        ],
        payment: (o) => {
            const paid = Number(o.paye) === 1;
            const n = Array.isArray(o.payments) ? o.payments.length : 0;
            return { sub: paid ? "Soldée" : (n > 0 ? `${n} paiement${n > 1 ? "s" : ""}` : "Aucun"), done: paid };
        },
    },

    sideRail: { totalsRows: (o) => baseTotalsRows(o) },

    actions: [
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "pay", label: "Enregistrer paiement", icon: FaCreditCard, tone: "success", group: "primary",
          visible: (o) => Number(o.statut) >= 1 && Number(o.paye) !== 1, run: (d) => d.openPayment },

        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },
        { id: "genpdf", label: "Générer PDF", icon: FaFilePdf, tone: "slate", group: "common",
          run: (d) => d.handleGeneratePdf },
        { id: "send", label: "Envoyer", icon: FaPaperPlane, tone: "info", group: "common",
          run: (d) => d.openSendEmail },

        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetDraft },
        { id: "setpaid", label: "Classer payée", icon: FaCircleCheck, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetPaid },
        { id: "setunpaid", label: "Repasser en impayée", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 2, run: (d) => d.handleSetUnpaid },

        { id: "dlpdf", label: "Télécharger PDF", icon: FaDownload, group: "convert",
          visible: (o, d) => d.hasLastMainDoc, run: (d) => d.handleDownloadPdf },
        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert", run: (d) => d.handleClone },

        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          run: (d) => d.handleDelete },
    ],

    tabs: [
        infoTab("supplierinvoice", "dolipocket.supplierinvoicepage.header", SUPPLIER_INVOICE_HEADER_OVERRIDES),
        documentsTab("supplier_invoice"),
        contactsTab,
        linksTab,
        { id: "payments", label: "Paiements", icon: FaCreditCard,
          badge: (o) => (Array.isArray(o.payments) && o.payments.length ? o.payments.length : null),
          render: ({ object }) => <InvoicePaymentsPanel object={object} /> },
        notesTab,
    ],

    renderModals: (data) => {
        const o = data.invoice;
        if (!o) return null;
        return (
            <>
                {sendEmailModal(data, o, { docLabel: "la facture fournisseur", subjectPrefix: "Facture fournisseur" })}
                <AddPaymentModal
                    open={!!data.paymentOpen}
                    onClose={data.closePayment}
                    onSubmit={data.submitPayment}
                    defaultAmount={Number(o.remainToPay ?? o.totalTtc ?? 0)}
                    currencyLabel="EUR"
                    paymentModes={SUPPLIER_PAYMENT_MODES}
                    defaultPaymentMode={2}
                    docLabel="facture fournisseur"
                />
            </>
        );
    },
};

// -----------------------------------------------------------------------------
// Supplier price request (SupplierProposal)
// -----------------------------------------------------------------------------

const SUPPLIER_PROPOSAL_HEADER_OVERRIDES = {
    ref:            { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:          { defaultVisible: true,  formatter: (v) => (v ? `#${v}` : "-") },
    dateCreation:   { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    dateValidation: { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    deliveryDate:   { defaultVisible: true,  formatter: (v) => fmtDateFr(v) || "-" },
    totalHt:        { defaultVisible: false, formatter: (v) => fmtMoney(v) },
    totalTtc:       { defaultVisible: false, formatter: (v) => fmtMoney(v) },
};

export const SUPPLIER_PROPOSAL_CONFIG = {
    feature: "supplierproposal",
    objectKey: "proposal",
    label: "Demande de prix",
    backLabel: "Retour aux demandes de prix",
    icon: FaFileInvoice,
    title: (o) => o?.ref || "Demande de prix",
    setObject: (d) => d.setProposal,

    pills: (o) => [{ feature: "supplierproposal", status: o.statut }],

    summary: {
        thirdparty: (o) => ({ id: o.socid, name: o.socname }),
        dates: (o) => [
            { label: "Création", value: fmtDateFr(o.dateCreation) },
            { label: "Validation", value: fmtDateFr(o.dateValidation) },
            { label: "Livraison", value: fmtDateFr(o.deliveryDate) },
        ],
        hero: (o) => ({ ttc: o.totalTtc, ht: o.totalHt }),
    },

    flow: {
        steps: [
            { key: "self",             label: "Demande de prix", self: true },
            { key: "order_supplier",   label: "Cmd fournisseur", match: ["order_supplier", "commande_fournisseur"], route: "/supplier-orders" },
            { key: "invoice_supplier", label: "Facture fourn.",  match: ["invoice_supplier", "facture_fourn"],     route: "/supplier-invoices" },
        ],
    },

    sideRail: { totalsRows: (o) => baseTotalsRows(o) },

    actions: [
        { id: "validate", label: "Valider", icon: FaCheck, tone: "primary", group: "primary",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleValidate },
        { id: "signed", label: "Signer", icon: FaThumbsUp, tone: "success", group: "primary",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleCloseSigned },

        { id: "edit", label: "Modifier", icon: FaPen, tone: "neutral", group: "common",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.goEdit },

        { id: "unsigned", label: "Non signée", icon: FaThumbsDown, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleCloseUnsigned },
        { id: "setdraft", label: "Repasser en brouillon", icon: FaRotateLeft, group: "status",
          visible: (o) => Number(o.statut) === 1, run: (d) => d.handleSetDraft },
        { id: "reopen", label: "Rouvrir", icon: FaLockOpen, group: "status",
          visible: (o) => Number(o.statut) === 2 || Number(o.statut) === 3 || Number(o.statut) === 4, run: (d) => d.handleReopen },

        { id: "clone", label: "Dupliquer", icon: FaCopy, group: "convert", run: (d) => d.handleClone },

        { id: "delete", label: "Supprimer", icon: FaTrash, tone: "danger", group: "danger",
          visible: (o) => Number(o.statut) === 0, run: (d) => d.handleDelete },
    ],

    tabs: [
        infoTab("supplierproposal", "dolipocket.supplierproposalpage.header", SUPPLIER_PROPOSAL_HEADER_OVERRIDES),
        linksTab,
        notesTab,
    ],
};
