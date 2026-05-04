import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaCheck, FaThumbsUp, FaPaperPlane, FaTruck, FaFileInvoiceDollar } from "react-icons/fa";

import { useStates, useConfirm, Page, Block, Button } from "@cap-rel/smartcommon";

import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";
import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validée",
    2: "Approuvée",
    3: "Commande envoyée",
    4: "Reçue partiellement",
    5: "Reçue totalement",
    6: "Annulée",
    7: "Annulée après commande",
    9: "Refusée",
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

export const SupplierOrderPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const dbSO = useDbSupplierOrders();
    const dbSI = useDbSupplierInvoices();
    const hasClient = !!dbSO.list;

    const { confirm, alert } = useConfirm();

    const { states, set } = useStates({
        order: null,
        loading: true,
        error: null,
        actionRunning: false,
    });

    const { order, loading, error, actionRunning } = states ?? {};

    const loadOrder = async () => {
        if (!hasClient || !id) return;
        set("loading", true);
        set("error", null);
        try {
            const data = await dbSO.get(id);
            set("order", data);
        } catch (err) {
            console.error("dbSO.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    useEffect(() => {
        if (hasClient) loadOrder();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const runStatusAction = async (action, confirmTitle, successMsg) => {
        if (actionRunning) return;
        const ok = await confirm({
            type: "info",
            title: confirmTitle,
            message: "Confirmer cette opération ?",
        });
        if (!ok) return;

        set("actionRunning", true);
        try {
            let data;
            if (action === "validate") {
                data = await dbSO.validate(id);
            } else if (action === "approve") {
                data = await dbSO.approve(id);
            } else if (action === "order") {
                data = await dbSO.order(id, {});
            } else if (action === "receive") {
                data = await dbSO.receive(id, {});
            } else {
                throw new Error(`Unknown action: ${action}`);
            }
            set("order", data);
            await alert({ type: "info", title: "Succès", message: successMsg });
        } catch (err) {
            console.error(`dbSO.${action} error`, err);
            await alert({ type: "warning", title: "Erreur", message: "L'opération a échoué." });
        } finally {
            set("actionRunning", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer la commande",
            message: "Cette action est irréversible.",
        });
        if (!ok) return;
        try {
            await dbSO.remove(id);
            await alert({ type: "info", title: "Supprimée", message: "Commande supprimée." });
            navigate("/supplier-orders", { replace: true });
        } catch (err) {
            console.error("dbSO.remove error", err);
            await alert({ type: "warning", title: "Erreur", message: "Suppression impossible." });
        }
    };

    const handleConvertToInvoice = async () => {
        const ok = await confirm({
            type: "info",
            title: "Créer la facture fournisseur",
            message: "Une facture brouillon sera créée à partir de cette commande.",
        });
        if (!ok) return;

        try {
            const data = await dbSI.createFromOrder(id);
            await alert({ type: "info", title: "Facture créée", message: "Redirection vers la facture..." });
            navigate(`/supplier-invoices/${data.id}`, { replace: true });
        } catch (err) {
            console.error("dbSI.createFromOrder error", err);
            await alert({ type: "warning", title: "Erreur", message: "Création de facture impossible." });
        }
    };

    if (loading) {
        return (
            <Page contentProps={{ className: "min-h-screen bg-gray-50" }}>
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            </Page>
        );
    }

    if (error || !order) {
        return (
            <Page contentProps={{ className: "min-h-screen bg-gray-50" }}>
                <div className="p-4 m-4 bg-red-100 text-red-700 rounded-lg">
                    {error || "Commande introuvable"}
                    <button onClick={loadOrder} className="ml-2 underline">Réessayer</button>
                </div>
            </Page>
        );
    }

    const statut = Number(order.statut ?? 0);
    const lines = Array.isArray(order.lines) ? order.lines : [];

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={() => navigate("/supplier-orders")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">{order.ref || "(sans réf)"}</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">
                            {STATUS_LABELS[statut] ?? `Statut ${statut}`}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(`/supplier-orders/${id}/edit`)}
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
                            <div className="text-gray-800">{order.thirdpartyName || `#${order.socid}`}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Réf fournisseur</div>
                            <div className="text-gray-800">{order.refSupplier || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Date commande</div>
                            <div className="text-gray-800">{formatDate(order.dateCommande) || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Date livraison</div>
                            <div className="text-gray-800">{formatDate(order.dateLivraison) || "-"}</div>
                        </div>
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
                            <span>{formatAmount(order.totalHt)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>TVA</span>
                            <span>{formatAmount(order.totalTva)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2">
                            <span>Total TTC</span>
                            <span>{formatAmount(order.totalTtc)}</span>
                        </div>
                    </div>
                </Block>

                {(order.notePublic || order.notePrivate) && (
                    <Block blockProps={{ className: "rounded-xl" }} title="Notes">
                        {order.notePublic && (
                            <div className="mb-2">
                                <div className="text-xs text-gray-500 uppercase">Publique</div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">{order.notePublic}</div>
                            </div>
                        )}
                        {order.notePrivate && (
                            <div>
                                <div className="text-xs text-gray-500 uppercase">Privée</div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">{order.notePrivate}</div>
                            </div>
                        )}
                    </Block>
                )}

                <Block blockProps={{ className: "rounded-xl" }} title="Workflow">
                    <div className="flex flex-col gap-2">
                        {statut === 0 && (
                            <Button
                                buttonProps={{
                                    onClick: () => runStatusAction("validate", "Valider la commande", "Commande validée."),
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaCheck /> Valider
                            </Button>
                        )}
                        {statut === 1 && (
                            <Button
                                buttonProps={{
                                    onClick: () => runStatusAction("approve", "Approuver la commande", "Commande approuvée."),
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaThumbsUp /> Approuver
                            </Button>
                        )}
                        {statut === 2 && (
                            <Button
                                buttonProps={{
                                    onClick: () => runStatusAction("order", "Marquer comme commandée", "Commande envoyée."),
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaPaperPlane /> Commande envoyée
                            </Button>
                        )}
                        {(statut === 3 || statut === 4) && (
                            <Button
                                buttonProps={{
                                    onClick: () => runStatusAction("receive", "Réception totale", "Réception enregistrée."),
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-green-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaTruck /> Marquer comme reçue
                            </Button>
                        )}
                        {statut >= 3 && (
                            <Button
                                buttonProps={{
                                    onClick: handleConvertToInvoice,
                                    disabled: actionRunning,
                                    className: "w-full py-3 bg-purple-600 text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                                }}
                            >
                                <FaFileInvoiceDollar /> Créer la facture fournisseur
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

export default SupplierOrderPage;
