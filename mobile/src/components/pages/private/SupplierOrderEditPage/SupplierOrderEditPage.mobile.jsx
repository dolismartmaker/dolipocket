import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from "react-icons/fa";

import { useStates, useConfirm, Page, Block, Input, Button } from "@cap-rel/smartcommon";
import { SearchPicker } from "../../../common/SearchPicker";

import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";

const toDateInput = (value) => {
    if (!value) return "";
    const ts = typeof value === "number" ? value * 1000 : Date.parse(value);
    if (Number.isNaN(ts)) return "";
    return new Date(ts).toISOString().slice(0, 10);
};

// Convert "YYYY-MM-DD" string from <input type="date"> to a unix timestamp
// in seconds. Returns 0 on empty.
const dateInputToTs = (value) => {
    if (!value) return 0;
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) return 0;
    return Math.floor(ts / 1000);
};

const emptyLine = () => ({
    description: "",
    qty: 1,
    subprice: 0,
    tvaTx: 20,
    remisePercent: 0,
});

export const SupplierOrderEditPage = () => {
    const { id } = useParams();
    const isCreate = !id || id === "new";
    const navigate = useNavigate();

    const dbSO = useDbSupplierOrders();
    const hasClient = !!dbSO.list;

    const { confirm, alert } = useConfirm();

    const { states, set } = useStates({
        loading: !isCreate,
        saving: false,
        order: null,
        socid: 0,
        refSupplier: "",
        dateCommande: toDateInput(Date.now() / 1000),
        dateLivraison: "",
        notePublic: "",
        notePrivate: "",
        lines: [],
        newLine: emptyLine(),
        addingLine: false,
    });

    const {
        loading, saving, order, socid, refSupplier, dateCommande, dateLivraison,
        notePublic, notePrivate, lines = [], newLine, addingLine,
    } = states ?? {};

    useEffect(() => {
        const load = async () => {
            if (isCreate || !hasClient) return;
            set("loading", true);
            try {
                const data = await dbSO.get(id);
                set("order", data);
                set("socid", Number(data?.socid ?? data?.fkSoc ?? 0));
                set("refSupplier", data?.refSupplier ?? "");
                set("dateCommande", toDateInput(data?.dateCommande));
                set("dateLivraison", toDateInput(data?.dateLivraison));
                set("notePublic", data?.notePublic ?? "");
                set("notePrivate", data?.notePrivate ?? "");
                set("lines", Array.isArray(data?.lines) ? data.lines : []);
            } catch (err) {
                console.error("dbSO.get error", err);
                await alert({ type: "warning", title: "Erreur", message: "Chargement impossible." });
                navigate("/supplier-orders", { replace: true });
            } finally {
                set("loading", false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const buildPayload = () => ({
        socid: socid || 0,
        refSupplier,
        dateCommande: dateInputToTs(dateCommande),
        dateLivraison: dateInputToTs(dateLivraison),
        notePublic,
        notePrivate,
    });

    const handleSave = async () => {
        if (!socid || socid <= 0) {
            await alert({ type: "warning", title: "Champ requis", message: "Le fournisseur est requis." });
            return;
        }
        set("saving", true);
        try {
            if (isCreate) {
                const payload = buildPayload();
                payload.lines = lines.map((l) => ({
                    description: l.description,
                    qty: Number(l.qty || 0),
                    subprice: Number(l.subprice || 0),
                    tvaTx: Number(l.tvaTx || 0),
                    remisePercent: Number(l.remisePercent || 0),
                }));
                const data = await dbSO.create(payload);
                navigate(`/supplier-orders/${data.id}`, { replace: true });
            } else {
                await dbSO.update(id, buildPayload());
                navigate(`/supplier-orders/${id}`, { replace: true });
            }
        } catch (err) {
            console.error("dbSO.save error", err);
            await alert({ type: "warning", title: "Erreur", message: "Enregistrement impossible." });
        } finally {
            set("saving", false);
        }
    };

    const handleAddLineToExisting = async () => {
        if (!newLine?.description) {
            await alert({ type: "warning", title: "Champ requis", message: "Description requise." });
            return;
        }
        set("addingLine", true);
        try {
            const data = await dbSO.addLine(id, {
                description: newLine.description,
                qty: Number(newLine.qty || 0),
                subprice: Number(newLine.subprice || 0),
                tvaTx: Number(newLine.tvaTx || 0),
                remisePercent: Number(newLine.remisePercent || 0),
            });
            set("lines", Array.isArray(data?.lines) ? data.lines : []);
            set("newLine", emptyLine());
        } catch (err) {
            console.error("dbSO.addLine error", err);
            await alert({ type: "warning", title: "Erreur", message: "Ajout de ligne impossible." });
        } finally {
            set("addingLine", false);
        }
    };

    const handleDeleteLine = async (lineId) => {
        if (isCreate) {
            // For draft creation, just remove from local state
            set("lines", lines.filter((l, idx) => (l.id ?? idx) !== lineId));
            return;
        }
        const ok = await confirm({ type: "delete", title: "Supprimer la ligne", message: "Confirmer ?" });
        if (!ok) return;
        try {
            const data = await dbSO.deleteLine(id, lineId);
            set("lines", Array.isArray(data?.lines) ? data.lines : []);
        } catch (err) {
            console.error("dbSO.deleteLine error", err);
            await alert({ type: "warning", title: "Erreur", message: "Suppression impossible." });
        }
    };

    const handleAddLineLocal = () => {
        if (!newLine?.description) return;
        set("lines", [...lines, { ...newLine, id: Date.now() * -1 }]);
        set("newLine", emptyLine());
    };

    if (loading) {
        return (
            <Page contentProps={{ className: "min-h-screen bg-gray-50" }}>
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            </Page>
        );
    }

    return (
        <Page contentProps={{ className: "pb-app-base bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-4xl md:mx-auto">
                    <button
                        onClick={() => navigate(isCreate ? "/supplier-orders" : `/supplier-orders/${id}`)}
                        className="p-2 -ml-2 md:hidden"
                        aria-label="Retour"
                    >
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isCreate ? "Nouvelle commande" : `Modifier ${order?.ref ?? ""}`}
                        </h1>
                    </div>
                </div>
            </div>

            <div className="p-4 md:px-6 flex flex-col gap-4 md:max-w-4xl md:mx-auto">
                <Block blockProps={{ className: "rounded-xl" }} title="En-tête">
                    <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
                        <SearchPicker
                            label="Fournisseur"
                            value={socid || 0}
                            onChange={(id) => set("socid", id)}
                            endpoint="thirdparty"
                            placeholder="Rechercher un fournisseur..."
                            renderItem={(item) => ({
                                title: item.nom || item.name || `#${item.id}`,
                                subtitle: [item.town, item.country_code].filter(Boolean).join(", "),
                            })}
                            required
                            onCreateNew={() => navigate("/thirdparties/new?type=fournisseur&back=1")}
                            createLabel="Nouveau fournisseur"
                        />
                        <Input
                            label="Référence fournisseur"
                            value={refSupplier}
                            onChange={(value) => set("refSupplier", value)}
                        />
                        <div className="flex flex-col gap-1">
                            <label htmlFor="so-date-cmd" className="text-sm font-medium text-gray-600">Date commande</label>
                            <input
                                id="so-date-cmd"
                                type="date"
                                value={dateCommande || ""}
                                onChange={(e) => set("dateCommande", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="so-date-liv" className="text-sm font-medium text-gray-600">Date livraison</label>
                            <input
                                id="so-date-liv"
                                type="date"
                                value={dateLivraison || ""}
                                onChange={(e) => set("dateLivraison", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="so-note-pub" className="text-sm font-medium text-gray-600">Note publique</label>
                            <textarea
                                id="so-note-pub"
                                value={notePublic || ""}
                                onChange={(e) => set("notePublic", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[80px]"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="so-note-priv" className="text-sm font-medium text-gray-600">Note privée</label>
                            <textarea
                                id="so-note-priv"
                                value={notePrivate || ""}
                                onChange={(e) => set("notePrivate", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[80px]"
                            />
                        </div>
                    </div>
                </Block>

                <Block blockProps={{ className: "rounded-xl" }} title={`Lignes (${lines.length})`}>
                    <div className="flex flex-col gap-2">
                        {lines.map((l, idx) => (
                            <div key={l.id ?? idx} className="border border-gray-100 rounded-lg p-3 flex justify-between gap-2">
                                <div className="flex-1 text-sm">
                                    <div className="font-medium text-gray-800">{l.description || l.label || "(ligne)"}</div>
                                    <div className="text-xs text-gray-500">
                                        {Number(l.qty ?? 0)} x {Number(l.subprice ?? 0)} EUR -- TVA {l.tvaTx ?? 0} %
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteLine(l.id ?? idx)}
                                    className="p-2 text-red-500 active:bg-red-50 rounded"
                                    aria-label="Supprimer"
                                >
                                    <FaTrash />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col gap-2">
                        <div className="text-sm font-medium text-gray-600">Nouvelle ligne</div>
                        <Input
                            label="Description"
                            value={newLine?.description || ""}
                            onChange={(value) => set("newLine.description", value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                label="Qté"
                                value={String(newLine?.qty ?? "")}
                                onChange={(value) => set("newLine.qty", value)}
                            />
                            <Input
                                label="P.U. HT"
                                value={String(newLine?.subprice ?? "")}
                                onChange={(value) => set("newLine.subprice", value)}
                            />
                            <Input
                                label="TVA %"
                                value={String(newLine?.tvaTx ?? "")}
                                onChange={(value) => set("newLine.tvaTx", value)}
                            />
                            <Input
                                label="Remise %"
                                value={String(newLine?.remisePercent ?? "")}
                                onChange={(value) => set("newLine.remisePercent", value)}
                            />
                        </div>
                        <Button
                            buttonProps={{
                                onClick: isCreate ? handleAddLineLocal : handleAddLineToExisting,
                                disabled: addingLine,
                                className: "py-2 bg-primary text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                            }}
                        >
                            <FaPlus /> Ajouter la ligne
                        </Button>
                    </div>
                </Block>

                <Button
                    buttonProps={{
                        onClick: handleSave,
                        disabled: saving,
                        className: "py-3 bg-primary text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50",
                    }}
                >
                    <FaSave /> Enregistrer
                </Button>
            </div>
        </Page>
    );
};

export default SupplierOrderEditPage;
