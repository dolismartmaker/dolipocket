import { FaArrowLeft, FaTrash, FaPen, FaCheck, FaUndo, FaCheckCircle, FaBan, FaCopy } from "react-icons/fa";

import { Page, Block, Button } from "@cap-rel/smartcommon";

import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";
import { noteToText } from "src/lib/utils/htmlText";

import { STATUS_LABELS, fmtAmount, fmtDate } from "./useInvoiceData";

// Mobile rendering of the invoice detail page. The lines block is now
// rendered through the shared <DocumentLinesEditor> (mobile variant: card
// stack + bottom sheet form) so add/edit/delete/reorder logic is identical
// to the desktop view. readOnly mirrors the desktop rule: editable only
// while the invoice is in draft (statut === 0).
export const InvoicePageMobile = (props) => {
    const {
        invoice, loading, error, actionPending,
        isDraft, isPaid,
        handleValidate, handleDelete, handleClone,
        handleSetDraft, handleSetPaid, handleSetCanceled, handleSetUnpaid,
        goEdit, goBack,
        dataSource, setInvoice,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={goBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
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
                            <div>{fmtDate(invoice.datef)}</div>
                            <div className="text-gray-500">Échéance</div>
                            <div>{fmtDate(invoice.dateLimReglement)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[invoice.statut] ?? "?"}</div>
                            <div className="text-gray-500">Paiement</div>
                            <div className={isPaid ? "text-green-700 font-bold" : "text-orange-700 font-bold"}>
                                {isPaid ? "Payée" : "Impayée"}
                            </div>
                        </div>
                    </Block>

                    <div className="px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto">
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
                    </div>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Totaux">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="text-gray-500">Total HT</div>
                            <div className="text-right">{fmtAmount(invoice.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{fmtAmount(invoice.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{fmtAmount(invoice.totalTtc)} EUR</div>
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
                                    <div className="text-xs text-gray-500">{fmtDate(p.date)}</div>
                                </div>
                                <div className="text-right font-semibold">
                                    {fmtAmount(p.amount)} EUR
                                </div>
                            </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200">
                            <div className="text-gray-500">Total payé</div>
                            <div className="text-right">{fmtAmount(invoice.totalPaid)} EUR</div>
                            <div className="text-gray-500 font-bold">Reste à payer</div>
                            <div className="text-right font-bold">{fmtAmount(invoice.remainToPay)} EUR</div>
                        </div>
                    </Block>

                    {(invoice.notePublic || invoice.notePrivate) && (
                        <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Notes">
                            {invoice.notePublic && (
                                <div className="mb-2">
                                    <div className="text-xs text-gray-500">Publique</div>
                                    <div className="whitespace-pre-wrap">{noteToText(invoice.notePublic)}</div>
                                </div>
                            )}
                            {invoice.notePrivate && (
                                <div>
                                    <div className="text-xs text-gray-500">Privée</div>
                                    <div className="whitespace-pre-wrap">{noteToText(invoice.notePrivate)}</div>
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
                        {invoice.statut === 1 && (
                            <Button
                                onClick={handleSetDraft}
                                icon={FaUndo}
                                buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                                disabled={actionPending}
                            >
                                Repasser en brouillon
                            </Button>
                        )}
                        {invoice.statut === 1 && (
                            <Button
                                onClick={handleSetPaid}
                                icon={FaCheckCircle}
                                buttonProps={{ className: "p-3 rounded-lg bg-green-600 text-white" }}
                                disabled={actionPending}
                            >
                                Classer payée
                            </Button>
                        )}
                        {invoice.statut === 1 && (
                            <Button
                                onClick={handleSetCanceled}
                                icon={FaBan}
                                buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                                disabled={actionPending}
                            >
                                Classer abandonnée
                            </Button>
                        )}
                        {(invoice.statut === 2 || invoice.statut === 3) && (
                            <Button
                                onClick={handleSetUnpaid}
                                icon={FaUndo}
                                buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                                disabled={actionPending}
                            >
                                Repasser en impayée
                            </Button>
                        )}
                        <Button
                            onClick={handleClone}
                            icon={FaCopy}
                            buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                            disabled={actionPending}
                        >
                            Dupliquer
                        </Button>
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
