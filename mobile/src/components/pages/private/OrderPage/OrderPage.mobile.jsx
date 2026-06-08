import { FaArrowLeft, FaTrash, FaPen, FaCheck } from "react-icons/fa";

import { Page, Block, Button } from "@cap-rel/smartcommon";

import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

import { STATUS_LABELS, fmtAmount, fmtDate } from "./useOrderData";

// Mobile rendering of the order detail page. The lines block is now
// rendered through the shared <DocumentLinesEditor> (mobile variant: card
// stack + bottom sheet form) so add/edit/delete/reorder logic is identical
// to the desktop view. readOnly mirrors the desktop rule: editable only
// while the order is in draft (statut === 0).
export const OrderPageMobile = (props) => {
    const {
        order, loading, error, actionPending,
        isDraft, isValidated,
        handleValidate, handleDelete, handleConvertToInvoice,
        goEdit, goBack,
        dataSource, setOrder,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={goBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
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
                            <div>{fmtDate(order.dateCommande)}</div>
                            <div className="text-gray-500">Date livraison</div>
                            <div>{fmtDate(order.dateLivraison)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[order.statut] ?? "?"}</div>
                        </div>
                    </Block>

                    <div className="px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                        <DocumentLinesEditor
                            docId={Number(order.id)}
                            lines={order.lines ?? []}
                            dataSource={dataSource}
                            onChange={(updated) => {
                                if (updated && typeof setOrder === "function") {
                                    setOrder(updated);
                                }
                            }}
                            readOnly={order.statut !== 0}
                        />
                    </div>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Totaux">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="text-gray-500">Total HT</div>
                            <div className="text-right">{fmtAmount(order.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{fmtAmount(order.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{fmtAmount(order.totalTtc)} EUR</div>
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
