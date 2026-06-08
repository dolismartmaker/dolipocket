import {
    FaArrowLeft, FaPen, FaTrash, FaCheck, FaTruck, FaFileInvoice, FaThumbsUp,
} from "react-icons/fa6";

import { Page, Block, Button } from "@cap-rel/smartcommon";

import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

import { STATUS_LABELS, fmtAmount, fmtDate } from "./useSupplierOrderData";

// Mobile rendering of the supplier order detail page. Reproduces the
// pre-split UX: gradient header, blocks, full-width action buttons.
// The lines block is now rendered through the shared <DocumentLinesEditor>
// (mobile variant: card stack + bottom sheet form). readOnly follows the
// desktop rule: editable only while the supplier order is in draft
// (statut === 0).
export const SupplierOrderPageMobile = (props) => {
    const {
        id, order, loading, error, actionPending,
        statut, isDraft, canApprove, canOrder, canReceive, canConvertToInvoice,
        handleValidate, handleApprove, handleOrder, handleReceive,
        handleDelete, handleConvertToInvoice,
        goEdit, goBack,
        dataSource, setSupplierOrder,
    } = props;

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
                </div>
            </Page>
        );
    }

    const lines = Array.isArray(order.lines) ? order.lines : [];

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white">
                <div className="flex items-center gap-3">
                    <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">{order.ref || "(sans réf)"}</h1>
                        <p className="text-sm text-white/80">{STATUS_LABELS[statut] ?? `Statut ${statut}`}</p>
                    </div>
                    {isDraft && (
                        <button onClick={goEdit} className="p-2 bg-white/20 rounded-lg" aria-label="Modifier">
                            <FaPen />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-4 flex flex-col gap-4">
                <Block blockProps={{ className: "rounded-xl" }} title="Informations">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Fournisseur</div>
                            <div>{order.thirdpartyName || `#${order.socid}`}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Date commande</div>
                            <div>{fmtDate(order.dateCommande) || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Réf fournisseur</div>
                            <div>{order.refSupplier || "-"}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Statut</div>
                            <div>{STATUS_LABELS[statut] ?? `Statut ${statut}`}</div>
                        </div>
                    </div>
                </Block>

                <DocumentLinesEditor
                    docId={Number(order.id)}
                    lines={lines}
                    dataSource={dataSource}
                    onChange={(updated) => {
                        if (updated && typeof setSupplierOrder === "function") {
                            setSupplierOrder(updated);
                        }
                    }}
                    readOnly={order.statut !== 0}
                />

                <Block blockProps={{ className: "rounded-xl" }} title="Totaux">
                    <div className="flex flex-col gap-1 text-sm">
                        <div className="flex justify-between">
                            <span>Total HT</span>
                            <span>{fmtAmount(order.totalHt)} EUR</span>
                        </div>
                        <div className="flex justify-between">
                            <span>TVA</span>
                            <span>{fmtAmount(order.totalTva)} EUR</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                            <span>Total TTC</span>
                            <span>{fmtAmount(order.totalTtc)} EUR</span>
                        </div>
                    </div>
                </Block>

                <Block blockProps={{ className: "rounded-xl" }} title="Actions">
                    <div className="flex flex-col gap-2">
                        {isDraft && (
                            <Button
                                onClick={handleValidate}
                                icon={FaCheck}
                                buttonProps={{ className: "w-full py-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2" }}
                                disabled={actionPending}
                            >
                                Valider
                            </Button>
                        )}
                        {canApprove && (
                            <Button
                                onClick={handleApprove}
                                icon={FaThumbsUp}
                                buttonProps={{ className: "w-full py-3 bg-emerald-600 text-white rounded-lg flex items-center justify-center gap-2" }}
                                disabled={actionPending}
                            >
                                Approuver
                            </Button>
                        )}
                        {canOrder && (
                            <Button
                                onClick={handleOrder}
                                icon={FaTruck}
                                buttonProps={{ className: "w-full py-3 bg-violet-600 text-white rounded-lg flex items-center justify-center gap-2" }}
                                disabled={actionPending}
                            >
                                Commander
                            </Button>
                        )}
                        {canReceive && (
                            <Button
                                onClick={handleReceive}
                                icon={FaCheck}
                                buttonProps={{ className: "w-full py-3 bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2" }}
                                disabled={actionPending}
                            >
                                Réceptionner
                            </Button>
                        )}
                        {canConvertToInvoice && (
                            <Button
                                onClick={handleConvertToInvoice}
                                icon={FaFileInvoice}
                                buttonProps={{ className: "w-full py-3 bg-orange-600 text-white rounded-lg flex items-center justify-center gap-2" }}
                                disabled={actionPending}
                            >
                                Créer une facture
                            </Button>
                        )}
                        <Button
                            onClick={handleDelete}
                            icon={FaTrash}
                            buttonProps={{ className: "w-full py-3 bg-red-100 text-red-600 rounded-lg flex items-center justify-center gap-2" }}
                            disabled={actionPending}
                        >
                            Supprimer
                        </Button>
                    </div>
                </Block>
            </div>
        </Page>
    );
};
