import { FaArrowLeft, FaTrash, FaPen, FaCheck, FaTimes, FaUndo, FaFileInvoiceDollar, FaCopy } from "react-icons/fa";

import { Page, Block, Button } from "@cap-rel/smartcommon";

import { DocumentLinesEditor } from "src/lib/datatable/DocumentLinesEditor";

import { STATUS_LABELS, fmtAmount, fmtDate } from "./useProposalData";

// Mobile rendering of the proposal detail page. The lines block is now
// rendered through the shared <DocumentLinesEditor> (mobile variant: card
// stack + bottom sheet form) so add/edit/delete/reorder logic is identical
// to the desktop view. readOnly mirrors the desktop rule: editable only
// while the proposal is in draft (statut === 0).
export const ProposalPageMobile = (props) => {
    const {
        proposal, loading, error, actionPending,
        isDraft, isValidated, isSigned,
        handleValidate, handleSign, handleUnsign, handleDelete,
        handleSetDraft, handleClassifyBilled, handleClone,
        goEdit, goBack,
        dataSource, setProposal,
    } = props;

    return (
        <Page contentProps={{ className: "pb-app-base" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base">
                <button onClick={goBack} className="p-2 -ml-2" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : proposal?.ref || "Devis"}
                </h1>
            </div>

            {error && (
                <div className="m-4 bg-red-100 text-red-700 p-3 rounded-lg">
                    {error}
                </div>
            )}

            {!loading && proposal && (
                <>
                    <Block
                        containerProps={{ className: "px-app-base mt-app-base" }}
                        blockProps={{ className: "rounded-xl" }}
                        title="Informations"
                    >
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-gray-500">Référence</div>
                            <div className="font-medium">{proposal.ref}</div>
                            <div className="text-gray-500">Référence client</div>
                            <div>{proposal.refClient || "-"}</div>
                            <div className="text-gray-500">Date</div>
                            <div>{fmtDate(proposal.datep)}</div>
                            <div className="text-gray-500">Validité</div>
                            <div>{fmtDate(proposal.finValidite)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[proposal.statut] ?? "?"}</div>
                        </div>
                    </Block>

                    <div className="px-app-base mt-app-base">
                        <DocumentLinesEditor
                            docId={Number(proposal.id)}
                            lines={proposal.lines ?? []}
                            dataSource={dataSource}
                            onChange={(updated) => {
                                if (updated && typeof setProposal === "function") {
                                    setProposal(updated);
                                }
                            }}
                            readOnly={proposal.statut !== 0}
                        />
                    </div>

                    <Block
                        containerProps={{ className: "px-app-base mt-app-base" }}
                        blockProps={{ className: "rounded-xl" }}
                        title="Totaux"
                    >
                        <div className="grid grid-cols-2 gap-2">
                            <div className="text-gray-500">Total HT</div>
                            <div className="text-right">{fmtAmount(proposal.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{fmtAmount(proposal.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{fmtAmount(proposal.totalTtc)} EUR</div>
                        </div>
                    </Block>

                    {(proposal.notePublic || proposal.notePrivate) && (
                        <Block
                            containerProps={{ className: "px-app-base mt-app-base" }}
                            blockProps={{ className: "rounded-xl" }}
                            title="Notes"
                        >
                            {proposal.notePublic && (
                                <div className="mb-2">
                                    <div className="text-xs text-gray-500">Publique</div>
                                    <div className="whitespace-pre-wrap">{proposal.notePublic}</div>
                                </div>
                            )}
                            {proposal.notePrivate && (
                                <div>
                                    <div className="text-xs text-gray-500">Privée</div>
                                    <div className="whitespace-pre-wrap">{proposal.notePrivate}</div>
                                </div>
                            )}
                        </Block>
                    )}

                    <div className="px-app-base mt-app-base flex flex-col gap-app-sm">
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
                            <>
                                <Button
                                    onClick={handleSign}
                                    icon={FaCheck}
                                    buttonProps={{ className: "p-3 rounded-lg bg-green-600 text-white" }}
                                    disabled={actionPending}
                                >
                                    Marquer signé
                                </Button>
                                <Button
                                    onClick={handleUnsign}
                                    icon={FaTimes}
                                    buttonProps={{ className: "p-3 rounded-lg bg-orange-500 text-white" }}
                                    disabled={actionPending}
                                >
                                    Marquer non signé
                                </Button>
                                <Button
                                    onClick={handleSetDraft}
                                    icon={FaUndo}
                                    buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                                    disabled={actionPending}
                                >
                                    Repasser en brouillon
                                </Button>
                            </>
                        )}
                        {isSigned && (
                            <Button
                                onClick={handleClassifyBilled}
                                icon={FaFileInvoiceDollar}
                                buttonProps={{ className: "p-3 rounded-lg bg-gray-200 text-gray-800" }}
                                disabled={actionPending}
                            >
                                Classer facturé
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
