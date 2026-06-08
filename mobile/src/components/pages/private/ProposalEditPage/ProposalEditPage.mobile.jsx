import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from "react-icons/fa";

import { Page, Block, Input, Button, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbProposals } from "src/db/stores/proposals/useDbProposals";
import { SearchPicker } from "../../../common/SearchPicker";

const formatAmount = (val) => {
    const n = Number(val ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Convert a "YYYY-MM-DD" string to a unix timestamp (seconds), or null
const dateStrToTs = (str) => {
    if (!str) return null;
    const ts = Math.floor(new Date(str).getTime() / 1000);
    if (!Number.isFinite(ts)) return null;
    return ts;
};

// Convert a unix timestamp (seconds) into "YYYY-MM-DD" for inputs
const tsToDateStr = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    const d = new Date(n * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

export const ProposalEditPage = () => {
    const { id } = useParams();
    const [search] = useSearchParams();
    const isNew = (id === undefined || id === "new");
    const initialSocId = Number(search.get("socid") || 0);
    const navigate = useNavigate();
    const dbProposals = useDbProposals();
    const { alert } = useConfirm();
    const hasClient = !!dbProposals.list;

    const { states, set } = useStates({
        proposal: null,
        loading: !isNew,
        saving: false,
        error: null,
        // Header form values
        socid: initialSocId,
        refClient: "",
        datep: tsToDateStr(Math.floor(Date.now() / 1000)),
        finValidite: "",
        notePublic: "",
        notePrivate: "",
        // New line buffer
        lineLabel: "",
        lineQty: "1",
        lineSubprice: "0",
        lineTvaTx: "20",
        addingLine: false,
    });

    const {
        proposal, loading, saving, error,
        socid, refClient, datep, finValidite, notePublic, notePrivate,
        lineLabel, lineQty, lineSubprice, lineTvaTx, addingLine,
    } = states ?? {};

    useEffect(() => {
        if (hasClient && !isNew) {
            loadProposal();
        }

    }, [hasClient, id]);

    const loadProposal = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProposals.get(id);
            set("proposal", data);
            set("socid", Number(data?.socid ?? data?.fkSoc ?? 0));
            set("refClient", data?.refClient ?? "");
            set("datep", tsToDateStr(data?.datep));
            set("finValidite", tsToDateStr(data?.finValidite));
            set("notePublic", data?.notePublic ?? "");
            set("notePrivate", data?.notePrivate ?? "");
        } catch (err) {
            console.error("dbProposals.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const handleSave = async () => {
        if (!socid || socid <= 0) {
            await alert({
                type: "warning",
                title: "Tiers manquant",
                message: "Indiquez un identifiant de tiers (socid) pour le devis.",
            });
            return;
        }
        set("saving", true);
        set("error", null);
        try {
            const payload = {
                socid: Number(socid),
                fkSoc: Number(socid),
                refClient: refClient ?? "",
                datep: dateStrToTs(datep),
                finValidite: dateStrToTs(finValidite),
                notePublic: notePublic ?? "",
                notePrivate: notePrivate ?? "",
            };
            if (isNew) {
                const data = await dbProposals.create(payload);
                if (data?.id) {
                    navigate(`/proposals/${data.id}/edit`, { replace: true });
                } else {
                    set("error", "Création échouée");
                }
            } else {
                const data = await dbProposals.update(id, payload);
                set("proposal", data);
            }
        } catch (err) {
            console.error("dbProposals.create/update error", err);
            set("error", "Erreur lors de l'enregistrement");
        } finally {
            set("saving", false);
        }
    };

    const handleAddLine = async () => {
        if (!proposal?.id) return;
        if (!lineLabel?.trim()) {
            await alert({ type: "warning", title: "Libellé requis", message: "Saisissez un libellé pour la ligne." });
            return;
        }
        set("addingLine", true);
        try {
            await dbProposals.addLine(proposal.id, {
                label: lineLabel.trim(),
                description: lineLabel.trim(),
                qty: Number(lineQty || 1),
                subprice: Number(lineSubprice || 0),
                tvaTx: Number(lineTvaTx || 0),
                productType: 0,
            });
            // Reload proposal so lines reflect the addition
            const refreshed = await dbProposals.get(proposal.id);
            set("proposal", refreshed);
            set("lineLabel", "");
            set("lineQty", "1");
            set("lineSubprice", "0");
        } catch (err) {
            console.error("dbProposals.addLine error", err);
            set("error", "Erreur lors de l'ajout de la ligne");
        } finally {
            set("addingLine", false);
        }
    };

    const handleDeleteLine = async (lineid) => {
        try {
            await dbProposals.deleteLine(proposal.id, lineid);
            // Reload proposal so lines reflect the deletion
            const refreshed = await dbProposals.get(proposal.id);
            set("proposal", refreshed);
        } catch (err) {
            console.error("dbProposals.deleteLine error", err);
            set("error", "Erreur lors de la suppression de la ligne");
        }
    };

    const goBack = () => {
        if (isNew) {
            navigate("/proposals");
        } else {
            navigate(`/proposals/${id}`);
        }
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6" }}>
            <div className="flex items-center gap-app-sm px-app-base pt-app-base md:px-6 md:max-w-4xl md:mx-auto">
                <button onClick={goBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                    <FaArrowLeft />
                </button>
                <h1 className="text-app-2xl font-bold flex-1">
                    {isNew ? "Nouveau devis" : `Modifier ${proposal?.ref || ""}`}
                </h1>
            </div>

            {error && <div className="m-4 bg-red-100 text-red-700 p-3 rounded-lg md:max-w-4xl md:mx-auto">{error}</div>}
            {loading && <div className="text-center text-gray-500 p-4 md:max-w-4xl md:mx-auto">Chargement...</div>}

            {(!loading || isNew) && (
                <>
                    <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-4xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="En-tête">
                        <div className="flex flex-col gap-app-sm md:grid md:grid-cols-2 md:gap-4">
                            <div className="md:col-span-2">
                                <SearchPicker
                                    label="Tiers"
                                    value={socid || 0}
                                    onChange={(id) => set("socid", id)}
                                    endpoint="thirdparty"
                                    placeholder="Rechercher un tiers..."
                                    renderItem={(item) => ({
                                        title: item.nom || item.name || `#${item.id}`,
                                        subtitle: [item.town, item.country_code].filter(Boolean).join(", "),
                                    })}
                                    required
                                    onCreateNew={() => navigate("/thirdparties/new?type=client&back=1")}
                                    createLabel="Nouveau tiers"
                                />
                            </div>
                            <Input
                                label="Référence client"
                                value={refClient ?? ""}
                                onChange={(val) => set("refClient", val)}
                            />
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-600">Date du devis</label>
                                <input
                                    type="date"
                                    value={datep ?? ""}
                                    onChange={(e) => set("datep", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-600">Fin de validité</label>
                                <input
                                    type="date"
                                    value={finValidite ?? ""}
                                    onChange={(e) => set("finValidite", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200"
                                />
                            </div>
                            <div className="flex flex-col gap-1 md:col-span-2">
                                <label className="text-sm font-medium text-gray-600">Note publique</label>
                                <textarea
                                    value={notePublic ?? ""}
                                    onChange={(e) => set("notePublic", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 min-h-[80px]"
                                />
                            </div>
                            <div className="flex flex-col gap-1 md:col-span-2">
                                <label className="text-sm font-medium text-gray-600">Note privée</label>
                                <textarea
                                    value={notePrivate ?? ""}
                                    onChange={(e) => set("notePrivate", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 min-h-[80px]"
                                />
                            </div>
                            <Button
                                onClick={handleSave}
                                icon={FaSave}
                                disabled={saving}
                                loading={saving}
                                buttonProps={{ className: "p-3 rounded-lg bg-primary text-white md:col-span-2" }}
                            >
                                {isNew ? "Créer" : "Enregistrer"}
                            </Button>
                        </div>
                    </Block>

                    {!isNew && proposal && (
                        <>
                            <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-4xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Lignes">
                                {(!proposal.lines || proposal.lines.length === 0) && (
                                    <div className="text-gray-500 italic">Aucune ligne</div>
                                )}
                                {proposal.lines?.map((line) => (
                                    <div key={line.id} className="border-b border-gray-100 py-2 flex items-center gap-2">
                                        <div className="flex-1">
                                            <div className="font-medium">{line.label || line.description}</div>
                                            <div className="text-sm text-gray-600">
                                                {Number(line.qty ?? 0)} x {formatAmount(line.subprice)} EUR = {formatAmount(line.totalHt)} EUR HT
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteLine(line.id)}
                                            className="p-2 text-red-600"
                                            aria-label="Supprimer la ligne"
                                        >
                                            <FaTrash />
                                        </button>
                                    </div>
                                ))}
                            </Block>

                            <Block containerProps={{ className: "px-app-base mt-app-base md:px-6 md:max-w-4xl md:mx-auto" }} blockProps={{ className: "rounded-xl" }} title="Ajouter une ligne">
                                <div className="flex flex-col gap-app-sm">
                                    <Input
                                        label="Libellé"
                                        value={lineLabel ?? ""}
                                        onChange={(val) => set("lineLabel", val)}
                                    />
                                    <div className="grid grid-cols-3 gap-2">
                                        <Input
                                            label="Quantité"
                                            value={String(lineQty ?? "1")}
                                            onChange={(val) => set("lineQty", val)}
                                            inputProps={{ inputMode: "decimal" }}
                                        />
                                        <Input
                                            label="Prix HT"
                                            value={String(lineSubprice ?? "0")}
                                            onChange={(val) => set("lineSubprice", val)}
                                            inputProps={{ inputMode: "decimal" }}
                                        />
                                        <Input
                                            label="TVA %"
                                            value={String(lineTvaTx ?? "20")}
                                            onChange={(val) => set("lineTvaTx", val)}
                                            inputProps={{ inputMode: "decimal" }}
                                        />
                                    </div>
                                    <Button
                                        onClick={handleAddLine}
                                        icon={FaPlus}
                                        disabled={addingLine}
                                        loading={addingLine}
                                        buttonProps={{ className: "p-3 rounded-lg bg-secondary text-white" }}
                                    >
                                        Ajouter la ligne
                                    </Button>
                                </div>
                            </Block>
                        </>
                    )}
                </>
            )}
        </Page>
    );
};
