import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaTrash, FaPen, FaCheck } from "react-icons/fa";

import { Page, Block, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Réglée",
    3: "Abandonnée",
};

const formatAmount = (val) => {
    const n = Number(val ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

export const InvoicePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbInvoices = useDbInvoices();
    const { confirm } = useConfirm();
    const hasClient = !!dbInvoices.list;

    const { states, set } = useStates({
        invoice: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { invoice, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadInvoice();
        }

    }, [hasClient, id]);

    const loadInvoice = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbInvoices.get(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.get error", err);
            set("error", "Erreur de chargement de la facture");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider la facture ?",
            message: "Une référence définitive sera attribuée.",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.validate(id);
            set("invoice", data);
        } catch (err) {
            console.error("dbInvoices.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette facture ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbInvoices.remove(id);
            navigate("/invoices", { replace: true });
        } catch (err) {
            console.error("dbInvoices.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const goEdit = () => navigate(`/invoices/${id}/edit`);

    const isDraft = (invoice?.statut === 0);
    const isPaid = (Number(invoice?.paye) === 1);

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={() => navigate("/invoices")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : invoice?.ref || "Facture"}
                </h1>
            </div>

            {error && <div className="m-4 bg-red-100 text-red-700 p-3 rounded-lg md:max-w-5xl md:mx-auto">{error}</div>}

            {!loading && invoice && (
                <>
                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Informations">
                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <div className="text-gray-500">Référence</div>
                            <div className="font-medium">{invoice.ref}</div>
                            <div className="text-gray-500">Référence client</div>
                            <div>{invoice.refClient || "-"}</div>
                            <div className="text-gray-500">Date facture</div>
                            <div>{formatDate(invoice.datef)}</div>
                            <div className="text-gray-500">Échéance</div>
                            <div>{formatDate(invoice.dateLimReglement)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[invoice.statut] ?? "?"}</div>
                            <div className="text-gray-500">Paiement</div>
                            <div className={isPaid ? "text-green-700 font-bold" : "text-orange-700 font-bold"}>
                                {isPaid ? "Payée" : "Impayée"}
                            </div>
                        </div>
                    </Block>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Lignes">
                        {(!invoice.lines || invoice.lines.length === 0) && (
                            <div className="text-gray-500 italic">Aucune ligne</div>
                        )}
                        {invoice.lines?.map((line) => (
                            <div key={line.id} className="border-b border-gray-100 py-2">
                                <div className="font-medium">{line.label || line.description}</div>
                                <div className="text-sm text-gray-600 flex justify-between">
                                    <span>{Number(line.qty ?? 0)} x {formatAmount(line.subprice)} EUR</span>
                                    <span>{formatAmount(line.totalHt)} EUR HT</span>
                                </div>
                            </div>
                        ))}
                    </Block>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Totaux">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="text-gray-500">Total HT</div>
                            <div className="text-right">{formatAmount(invoice.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{formatAmount(invoice.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{formatAmount(invoice.totalTtc)} EUR</div>
                        </div>
                    </Block>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Paiements">
                        {(!invoice.payments || invoice.payments.length === 0) && (
                            <div className="text-gray-500 italic">Aucun paiement enregistré</div>
                        )}
                        {invoice.payments?.map((p, idx) => (
                            <div key={idx} className="border-b border-gray-100 py-2 flex justify-between">
                                <div>
                                    <div className="font-medium">{p.ref || p.type}</div>
                                    <div className="text-xs text-gray-500">{formatDate(p.date)}</div>
                                </div>
                                <div className="text-right font-semibold">
                                    {formatAmount(p.amount)} EUR
                                </div>
                            </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200">
                            <div className="text-gray-500">Total payé</div>
                            <div className="text-right">{formatAmount(invoice.totalPaid)} EUR</div>
                            <div className="text-gray-500 font-bold">Reste à payer</div>
                            <div className="text-right font-bold">{formatAmount(invoice.remainToPay)} EUR</div>
                        </div>
                    </Block>

                    {(invoice.notePublic || invoice.notePrivate) && (
                        <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Notes">
                            {invoice.notePublic && (
                                <div className="mb-2">
                                    <div className="text-xs text-gray-500">Publique</div>
                                    <div className="whitespace-pre-wrap">{invoice.notePublic}</div>
                                </div>
                            )}
                            {invoice.notePrivate && (
                                <div>
                                    <div className="text-xs text-gray-500">Privée</div>
                                    <div className="whitespace-pre-wrap">{invoice.notePrivate}</div>
                                </div>
                            )}
                        </Block>
                    )}

                    <div className="px-app-base mt-app-base flex flex-col gap-app-sm md:px-6 md:max-w-5xl md:mx-auto md:flex-row md:flex-wrap">
                        {isDraft && (
                            <Button
                                onClick={goEdit}
                                icon={FaPen}
                                buttonProps={{ className: "p-3 rounded-lg bg-primary text-white" }}
                                disabled={actionPending}
                            >
                                Modifier
                            </Button>
                        )}
                        {isDraft && (
                            <Button
                                onClick={handleValidate}
                                icon={FaCheck}
                                buttonProps={{ className: "p-3 rounded-lg bg-blue-600 text-white" }}
                                disabled={actionPending}
                            >
                                Valider
                            </Button>
                        )}
                        <Button
                            onClick={handleDelete}
                            icon={FaTrash}
                            buttonProps={{ className: "p-3 rounded-lg bg-red-600 text-white" }}
                            disabled={actionPending}
                        >
                            Supprimer
                        </Button>
                    </div>
                </>
            )}
        </Page>
    );
};
