import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaTrash, FaPen, FaCheck } from "react-icons/fa";

import { Page, Block, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";

const STATUS_LABELS = {
    [-1]: "Annulé",
    0: "Brouillon",
    1: "Validé",
    2: "En cours",
    3: "Livré",
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

export const OrderPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbOrders = useDbOrders();
    const dbInvoices = useDbInvoices();
    const { confirm } = useConfirm();
    const hasClient = !!dbOrders.list;

    const { states, set } = useStates({
        order: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { order, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadOrder();
        }

    }, [hasClient, id]);

    const loadOrder = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbOrders.get(id);
            set("order", data);
        } catch (err) {
            console.error("dbOrders.get error", err);
            set("error", "Erreur de chargement de la commande");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider la commande ?",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbOrders.validate(id);
            set("order", data);
        } catch (err) {
            console.error("dbOrders.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cette commande ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbOrders.remove(id);
            navigate("/orders", { replace: true });
        } catch (err) {
            console.error("dbOrders.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const handleConvertToInvoice = async () => {
        const ok = await confirm({
            type: "info",
            title: "Créer une facture ?",
            message: "Une nouvelle facture sera créée à partir de cette commande.",
            confirmText: "Créer la facture",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbInvoices.createFromOrder(id);
            if (data?.id) {
                navigate(`/invoices/${data.id}`);
            }
        } catch (err) {
            console.error("dbInvoices.createFromOrder error", err);
            set("error", "Erreur lors de la création de la facture");
        } finally {
            set("actionPending", false);
        }
    };

    const goEdit = () => navigate(`/orders/${id}/edit`);

    const isDraft = (order?.statut === 0);
    const isValidated = (order?.statut === 1 || order?.statut === 2);

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={() => navigate("/orders")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : order?.ref || "Commande"}
                </h1>
            </div>

            {error && <div className="m-4 bg-red-100 text-red-700 p-3 rounded-lg md:max-w-5xl md:mx-auto">{error}</div>}

            {!loading && order && (
                <>
                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Informations">
                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <div className="text-gray-500">Référence</div>
                            <div className="font-medium">{order.ref}</div>
                            <div className="text-gray-500">Référence client</div>
                            <div>{order.refClient || "-"}</div>
                            <div className="text-gray-500">Date commande</div>
                            <div>{formatDate(order.dateCommande)}</div>
                            <div className="text-gray-500">Date livraison</div>
                            <div>{formatDate(order.dateLivraison)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[order.statut] ?? "?"}</div>
                        </div>
                    </Block>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Lignes">
                        {(!order.lines || order.lines.length === 0) && (
                            <div className="text-gray-500 italic">Aucune ligne</div>
                        )}
                        {order.lines?.map((line) => (
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
                            <div className="text-right">{formatAmount(order.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{formatAmount(order.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{formatAmount(order.totalTtc)} EUR</div>
                        </div>
                    </Block>

                    {(order.notePublic || order.notePrivate) && (
                        <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Notes">
                            {order.notePublic && (
                                <div className="mb-2">
                                    <div className="text-xs text-gray-500">Publique</div>
                                    <div className="whitespace-pre-wrap">{order.notePublic}</div>
                                </div>
                            )}
                            {order.notePrivate && (
                                <div>
                                    <div className="text-xs text-gray-500">Privée</div>
                                    <div className="whitespace-pre-wrap">{order.notePrivate}</div>
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
                        {isValidated && (
                            <Button
                                onClick={handleConvertToInvoice}
                                buttonProps={{ className: "p-3 rounded-lg bg-green-600 text-white" }}
                                disabled={actionPending}
                            >
                                Créer une facture
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
