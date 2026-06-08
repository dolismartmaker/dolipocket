import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaPen, FaCheck, FaFileInvoiceDollar, FaTrash, FaFilePdf, FaPaperPlane, FaDownload,
} from "react-icons/fa6";

import { useConfirm } from "@cap-rel/smartcommon";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { useMenu } from "src/lib/permissions";
import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { DocumentHeaderFields } from "src/lib/datatable";
import { DocumentsSection } from "src/lib/components/DocumentsSection";
import { SendEmailModal } from "src/lib/components/SendEmailModal";
import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";
import { MasterDetailLayout, EmptyDetail, TouchList, TouchListItem } from "src/lib/tablet";

import { useOrderData, fmtAmount, fmtDate } from "../OrderPage/useOrderData";

// Tablet master-detail workspace for Orders (commandes). Document feature:
// the detail pane reuses the full useOrderData() workflow (validate /
// convertToInvoice / PDF / email) -- only the presentation is touch-first and
// single column. DocumentLinesEditor auto-renders its touch (cards) variant on
// tablet.

const HEADER_OVERRIDES = {
    ref:           { defaultVisible: true,  formatter: (v) => v ?? "-" },
    refClient:     { defaultVisible: true,  formatter: (v) => v ?? "-" },
    socid:         { defaultVisible: true,  formatter: (v) => v ? `#${v}` : "-" },
    dateCommande:  { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    dateLivraison: { defaultVisible: true,  formatter: (v) => fmtDate(v) || "-" },
    statut:        { defaultVisible: true,  formatter: (v) => getStatusInfo("order", v).label },
    totalHt:       { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
    totalTtc:      { defaultVisible: false, formatter: (v) => `${fmtAmount(v)} EUR` },
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

const TotalRow = ({ label, value, strong = false }) => (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${strong ? "border-t border-soft-border pt-2 mt-1" : ""}`}>
        <span className={strong ? "text-strong-text font-semibold" : "text-soft-text"}>{label}</span>
        <span className={strong ? "text-strong-text font-semibold" : "text-strong-text"}>{value}</span>
    </div>
);

// Detail pane: mounted only when an order is selected, so useOrderData(id)
// always has a valid id. Delete is overridden locally (the hook's handleDelete
// navigates, which would break the in-pane flow) to clear the selection and
// refresh the list instead.
const OrderTabletDetail = ({ id, onDeleted }) => {
    const { confirm } = useConfirm() ?? {};
    const data = useOrderData(id);
    const {
        order, loading, error, actionPending,
        isDraft, isValidated,
        handleValidate, handleConvertToInvoice,
        handleGeneratePdf, handleDownloadPdf,
        hasLastMainDoc, goEdit, dataSource, setOrder,
        sendEmailOpen, openSendEmail, closeSendEmail, submitSendEmail,
    } = data;

    const [deleting, setDeleting] = useState(false);

    const handleLocalDelete = async () => {
        const ok = confirm
            ? await confirm({
                  type: "delete",
                  title: "Supprimer cette commande ?",
                  message: "Cette action est irréversible.",
                  confirmText: "Supprimer",
                  cancelText: "Annuler",
              })
            : window.confirm("Supprimer cette commande ?");
        if (!ok) return;
        setDeleting(true);
        try {
            await dataSource.remove(id);
            onDeleted?.();
        } catch (err) {
            console.error("[OrderTabletDetail] remove error", err);
            setDeleting(false);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Chargement...</div>;
    }
    if (error) {
        return <div className="h-full flex items-center justify-center text-sm text-red-600">{error}</div>;
    }
    if (!order) {
        return <div className="h-full flex items-center justify-center text-sm text-soft-text">Aucune donnée</div>;
    }

    const refLabel = order?.ref ? order.ref : `#${order?.id ?? ""}`;
    const defaultRecipient = order?.thirdparty?.email ?? order?.socEmail ?? order?.email ?? "";
    const pending = actionPending || deleting;

    return (
        <div className="min-h-full bg-medium-bg">
            {/* Sticky touch header */}
            <header className="sticky top-0 z-10 bg-white border-b border-soft-border px-4 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-base font-bold text-strong-text truncate">{order.ref || "Commande"}</h1>
                    <StatusPill feature="order" status={order.statut} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {isDraft && <ActionBtn onClick={goEdit} disabled={pending} icon={FaPen} label="Modifier" tone="neutral" />}
                    {isDraft && <ActionBtn onClick={handleValidate} disabled={pending} icon={FaCheck} label="Valider" tone="primary" />}
                    {isValidated && <ActionBtn onClick={handleConvertToInvoice} disabled={pending} icon={FaFileInvoiceDollar} label="Créer une facture" tone="success" />}
                    <ActionBtn onClick={handleGeneratePdf} disabled={pending} icon={FaFilePdf} label="Générer PDF" tone="slate" />
                    {hasLastMainDoc && <ActionBtn onClick={handleDownloadPdf} disabled={pending} icon={FaDownload} label="Télécharger PDF" tone="neutral" />}
                    <ActionBtn onClick={openSendEmail} disabled={pending} icon={FaPaperPlane} label="Envoyer" tone="blue" />
                    <ActionBtn onClick={handleLocalDelete} disabled={pending} icon={FaTrash} label="Supprimer" tone="danger" />
                </div>
            </header>

            {error && (
                <div className="mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
            )}

            {/* Single-column stacked body */}
            <div className="p-4 space-y-4 max-w-4xl">
                <DocumentLinesEditor
                    docId={Number(order.id)}
                    lines={order.lines ?? []}
                    dataSource={dataSource}
                    onChange={(updated) => { if (updated && typeof setOrder === "function") setOrder(updated); }}
                    readOnly={order.statut !== 0}
                />

                <DocumentHeaderFields
                    object={order}
                    feature="order"
                    dataSource={dataSource}
                    storageKey="dolipocket.order.tablet.header"
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
                        <div className="px-4 py-3 space-y-3 text-sm">
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

                <DocumentsSection
                    objectType="order"
                    objectId={Number(order.id)}
                    refreshKey={order.lastMainDoc || ""}
                />
            </div>

            <SendEmailModal
                open={!!sendEmailOpen}
                onClose={closeSendEmail}
                onSend={submitSendEmail}
                defaultTo={defaultRecipient}
                defaultSubject={`Commande ${refLabel}`.trim()}
                defaultBody={`Bonjour,\n\nVeuillez trouver ci-joint la commande ${refLabel}.\n\nCordialement.`}
                defaultAttachment=""
                docLabel="commande"
            />
        </div>
    );
};

const renderItem = (c) => (
    <TouchListItem
        primary={c.ref || `#${c.id}`}
        secondary={c.refClient || ""}
        amount={`${fmtAmount(c.totalTtc)} EUR`}
        badge={<StatusPill feature="order" status={c.statut} />}
    />
);

// The orders list endpoint has no server-side `q` search, so we filter the
// loaded page client-side on ref + refClient.
const filterItem = (c, q) =>
    (c.ref || "").toLowerCase().includes(q) || (c.refClient || "").toLowerCase().includes(q);

export const OrdersWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbOrders();
    const { has } = useMenu();

    const [selectedId, setSelectedId] = useState(initialId);
    const [reloadToken, setReloadToken] = useState(0);

    const load = useCallback(({ q }) => db.list({ q, perPage: 200 }), [db]);

    return (
        <MasterDetailLayout
            master={
                <TouchList
                    title="Commandes"
                    searchPlaceholder="Rechercher une commande..."
                    load={load}
                    reloadToken={reloadToken}
                    getKey={(c) => c.id}
                    renderItem={renderItem}
                    filterItem={filterItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("order.create") ? () => navigate("/orders/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <OrderTabletDetail
                        key={selectedId}
                        id={selectedId}
                        onDeleted={() => { setSelectedId(null); setReloadToken((t) => t + 1); }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez une commande" hint="Choisissez une commande dans la liste pour voir son détail." />
                )
            }
        />
    );
};
