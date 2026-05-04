import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaTrash, FaPen, FaCheck, FaTimes } from "react-icons/fa";

import { Page, Block, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProposals } from "src/db/stores/proposals/useDbProposals";

const STATUS_LABELS = {
    0: "Brouillon",
    1: "Validé",
    2: "Signé",
    3: "Non signé",
    4: "Facturé",
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

export const ProposalPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbProposals = useDbProposals();
    const { confirm } = useConfirm();
    const hasClient = !!dbProposals.list;

    const { states, set } = useStates({
        proposal: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { proposal, loading, error, actionPending } = states ?? {};

    useEffect(() => {
        if (hasClient) {
            loadProposal();
        }

    }, [hasClient, id]);

    const loadProposal = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProposals.get(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.get error", err);
            set("error", "Erreur de chargement du devis");
        } finally {
            set("loading", false);
        }
    };

    const handleValidate = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Valider le devis ?",
            message: "Le devis ne pourra plus être modifié librement.",
            confirmText: "Valider",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.validate(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.validate error", err);
            set("error", "Erreur lors de la validation");
        } finally {
            set("actionPending", false);
        }
    };

    const handleSign = async () => {
        const ok = await confirm({
            type: "info",
            title: "Marquer comme signé ?",
            confirmText: "Signé",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.closeSigned(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.closeSigned error", err);
            set("error", "Erreur lors de la signature");
        } finally {
            set("actionPending", false);
        }
    };

    const handleUnsign = async () => {
        const ok = await confirm({
            type: "warning",
            title: "Marquer comme non signé ?",
            confirmText: "Non signé",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            const data = await dbProposals.closeUnsigned(id);
            set("proposal", data);
        } catch (err) {
            console.error("dbProposals.closeUnsigned error", err);
            set("error", "Erreur lors du refus");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce devis ?",
            message: "Cette action est irréversible.",
            confirmText: "Supprimer",
            cancelText: "Annuler",
        });
        if (!ok) return;
        set("actionPending", true);
        try {
            await dbProposals.remove(id);
            navigate("/proposals", { replace: true });
        } catch (err) {
            console.error("dbProposals.remove error", err);
            set("error", "Erreur lors de la suppression");
            set("actionPending", false);
        }
    };

    const goEdit = () => {
        navigate(`/proposals/${id}/edit`);
    };

    const isDraft = (proposal?.statut === 0);
    const isValidated = (proposal?.statut === 1);

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-5xl md:mx-auto">
                <button onClick={() => navigate("/proposals")} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {loading ? "Chargement..." : proposal?.ref || "Devis"}
                </h1>
            </div>

            {error && <div className="m-4 bg-red-100 text-red-700 p-3 rounded-lg md:max-w-5xl md:mx-auto">{error}</div>}

            {!loading && proposal && (
                <>
                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Informations">
                        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <div className="text-gray-500">Référence</div>
                            <div className="font-medium">{proposal.ref}</div>
                            <div className="text-gray-500">Référence client</div>
                            <div>{proposal.refClient || "-"}</div>
                            <div className="text-gray-500">Date</div>
                            <div>{formatDate(proposal.datep)}</div>
                            <div className="text-gray-500">Validité</div>
                            <div>{formatDate(proposal.finValidite)}</div>
                            <div className="text-gray-500">Statut</div>
                            <div>{STATUS_LABELS[proposal.statut] ?? "?"}</div>
                        </div>
                    </Block>

                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Lignes">
                        {(!proposal.lines || proposal.lines.length === 0) && (
                            <div className="text-gray-500 italic">Aucune ligne</div>
                        )}
                        {proposal.lines?.map((line) => (
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
                            <div className="text-right">{formatAmount(proposal.totalHt)} EUR</div>
                            <div className="text-gray-500">TVA</div>
                            <div className="text-right">{formatAmount(proposal.totalTva)} EUR</div>
                            <div className="text-gray-500 font-bold">Total TTC</div>
                            <div className="text-right font-bold">{formatAmount(proposal.totalTtc)} EUR</div>
                        </div>
                    </Block>

                    {(proposal.notePublic || proposal.notePrivate) && (
                        <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-5xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Notes">
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
                            </>
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
