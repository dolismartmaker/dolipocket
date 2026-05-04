import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaCheck } from "react-icons/fa";

import { useStates, useConfirm, Page, Block, Button } from "@cap-rel/smartcommon";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Réglée",
    3: "Abandonnée",
};

const formatDate = (value) => {
    if (!value) return "";
    const ts = typeof value === "number" ? value * 1000 : Date.parse(value);
    if (Number.isNaN(ts)) return "";
    return new Date(ts).toLocaleDateString("fr-FR");
};

const formatAmount = (value) => {
    const n = Number(value ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
};

export const SupplierInvoicePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const dbSI = useDbSupplierInvoices();
    const hasClient = !!dbSI.list;

    const { confirm, alert } = useConfirm();

    const { states, set } = useStates({
        invoice: null,
        loading: true,
        error: null,
        actionRunning: false,
    });

    const { invoice, loading, error, actionRunning } = states ?? {};

    const loadInvoice = async () => {
        if (!hasClient || !id) return;
        set("loading", true);
        set("error", null);
        try {
            const data = await dbSI.get(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbSI.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    useEffect(() => {
        if (hasClient) loadInvoice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const handleValidate = async () => {
        if (actionRunning) return;
        const ok = await confirm({
            type: "info",
            title: "Valider la facture",
            message: "Confirmer la validation ?",
        });
        if (!ok) return;
        set("actionRunning", true);
        try {
            const data = await dbSI.validate(id);
            set("invoice", data);
            await alert({ type: "info", title: "Validée", message: "Facture validée." });
            // Reload to get payments + thirdparty enrichment
            await loadInvoice();
        } catch (err) {
            console.error("dbSI.validate error", err);
            await alert({ type: "warning", title: "Erreur", message: "Validation impossible." });
        } finally {
            set("actionRunning", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer la facture",
            message: "Cette action est irréversible.",
        });
        if (!ok) return;
        try {
            await dbSI.remove(id);
            await alert({ type: "info", title: "Supprimée", message: "Facture supprimée." });
            navigate("/supplier-invoices", { replace: true });
        } catch (err) {
            console.error("dbSI.remove error", err);
            await alert({ type: "warning", title: "Erreur", message: "Suppression impossible." });
        }
    };

    if (loading) {
        return (
            <Page contentProps={{ className: "min-h-screen bg-gray-50" }}>
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            </Page>
        );
    }

    if (error || !invoice) {
        return (
            <Page contentProps={{ className: "min-h-screen bg-gray-50" }}>
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">
                    {error || "Facture introuvable"}
                    <button onClick={loadInvoice} className="ml-2 underline">Réessayer</button>
                </div>
            </Page>
        );
    }

    const statut = Number(invoice.statut ?? 0);
    const isPaid = Number(invoice.paye ?? 0) === 1;
    const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const remain = Number(invoice.remainToPay ?? 0);

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={() => navigate("/supplier-invoices")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">{invoice.ref || "(sans réf)"}</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">
                            {STATUS_LABELS[statut] ?? `Statut ${statut}`} -- {isPaid ? "Payée" : "Impayée"}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/supplier-invoices/${id}/edit`)}
                        className="p-2 bg-white/20 rounded-lg active:bg-white/30"
                        aria-label="Modifier"
                    >
                        <FaPen />
                    </button>
                </div>
            </div>

            <div className="p-4 md:px-6 flex flex-col gap-4 md:max-w-5xl md:mx-auto">
                <Block blockProps={{ className: "rounded-xl" }} title="Informations">
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Fournisseur</div>
                            <div className="text-gray-800">{invoice.thirdpartyName || `#${invoice.socid}`}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Réf fournisseur</div>
                            <div className="text-gray-800">{invoice.refSupplier || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Date facture</div>
                            <div className="text-gray-800">{formatDate(invoice.datef) || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Échéance</div>
                            <div className="text-gray-800">{formatDate(invoice.dateLimReglement) || "-"}</div>
                        </div>
                        {invoice.libelle && (
                            <div className="col-span-2 md:col-span-4">
                                <div className="text-xs text-gray-500 uppercase">Libellé</div>
                                <div className="text-gray-800">{invoice.libelle}</div>
                            </div>
                        )}
                    </div>
                </Block>

                <Block blockProps={{ className: "rounded-xl" }} title={`Lignes (${lines.length})`}>
                    {lines.length === 0 ? (
                        <div className="text-gray-500 text-sm">Aucune ligne.</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {lines.map((l) => (
                                <div key={l.id} className="border-b border-gray-100 pb-2 last:border-0">
                                    <div className="flex justify-between gap-2">
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-800">
                                                {l.label || l.ref || "(ligne)"}
                                            </div>
                                            {l.description && (
                                                <div className="text-xs text-gray-500 whitespace-pre-wrap">{l.description}</div>
                                            )}
                                        </div>
                                        <div className="text-right text-sm">
                                            <div>{Number(l.qty ?? 0)} x {formatAmount(l.subprice)}</div>
                                            <div className="font-medium text-gray-800">{formatAmount(l.totalTtc)}</div>
                                            {l.tvaTx ? (
                                                <div className="text-xs text-gray-500">TVA {l.tvaTx} %</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Block>

                <Block blockProps={{ className: "rounded-xl" }} title="Totaux">
                    <div className="flex flex-col gap-1 text-sm">
                        <div className="flex justify-between">
                            <span>Total HT</span>
                            <span>{formatAmount(invoice.totalHt)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>TVA</span>
                            <span>{formatAmount(invoice.totalTva)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2">
                            <span>Total TTC</span>
                            <span>{formatAmount(invoice.totalTtc)}</span>
                        </div>
                        <div className="flex justify-between text-green-700">
                            <span>Déjà payé</span>
                            <span>{formatAmount(invoice.totalPaid)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-orange-700">
                            <span>Reste à payer</span>
                            <span>{formatAmount(remain)}</span>
                        </div>
                    </div>
                </Block>

                <Block blockProps={{ className: "rounded-xl" }} title={`Paiements (${payments.length})`}>
                    {payments.length === 0 ? (
                        <div className="text-gray-500 text-sm">Aucun paiement enregistré.</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {payments.map((p) => (
                                <div key={p.id} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0">
                                    <div>
                                        <div className="font-medium text-gray-800">{formatAmount(p.amount)}</div>
                                        <div className="text-xs text-gray-500">
                                            {formatDate(p.date)} -- {p.modeLabel || p.modeCode || "Mode inconnu"}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Block>

                {(invoice.notePublic || invoice.notePrivate) && (
                    <Block blockProps={{ className: "rounded-xl" }} title="Notes">
                        {invoice.notePublic && (
                            <div className="mb-2">
                                <div className="text-xs text-gray-500 uppercase">Publique</div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">{invoice.notePublic}</div>
                            </div>
                        )}
                        {invoice.notePrivate && (
                            <div>
                                <div className="text-xs text-gray-500 uppercase">Privée</div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">{invoice.notePrivate}</div>
                            </div>
                        )}
                    </Block>
                )}

                <Block blockProps={{ className: "rounded-xl" }} title="Actions">
                    <div className="flex flex-col gap-2">
                        {statut === 0 && (
                            <Button
                                buttonProps={{
                                    onClick: handleValidate,
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaCheck /> Valider
                            </Button>
                        )}
                        <Button
                            buttonProps={{
                                onClick: handleDelete,
                                className: "w-full py-3 bg-red-100 text-red-600 rounded-lg flex items-center justify-center gap-2",
                            }}
                        >
                            <FaTrash /> Supprimer
                        </Button>
                    </div>
                </Block>
            </div>
        </Page>
    );
};

export default SupplierInvoicePage;
