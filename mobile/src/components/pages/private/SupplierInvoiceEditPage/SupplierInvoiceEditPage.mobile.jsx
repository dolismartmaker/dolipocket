import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaSave, FaPlus, FaTrash } from "react-icons/fa";

import { useStates, useConfirm, Page, Block, Input, Select, Button } from "@cap-rel/smartcommon";
import { labelsWithFallback } from "src/utils";
import { SearchPicker } from "../../../common/SearchPicker";

import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";

// Values MUST match Dolibarr FactureFournisseur type constants
// (fournisseur.facture.class.php): TYPE_STANDARD=0, TYPE_REPLACEMENT=1,
// TYPE_CREDIT_NOTE=2, TYPE_DEPOSIT=3. The previous labelling was shifted
// (1=Avoir, 2=Acompte) and silently wrote the wrong type to the database.
const TYPE_OPTIONS = [
    { value: "0", label: "Standard" },
    { value: "1", label: "Remplacement" },
    { value: "2", label: "Avoir" },
    { value: "3", label: "Acompte" },
];

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

export const SupplierInvoiceEditPage = () => {
    const { id } = useParams();
    const isCreate = !id || id === "new";
    const navigate = useNavigate();

    const dbSI = useDbSupplierInvoices();
    const hasClient = !!dbSI.list;

    const { confirm, alert } = useConfirm();

    const { states, set } = useStates({
        loading: !isCreate,
        saving: false,
        invoice: null,
        socid: 0,
        refSupplier: "",
        type: "0",
        libelle: "",
        datef: toDateInput(Date.now() / 1000),
        dateLimReglement: "",
        notePublic: "",
        notePrivate: "",
        lines: [],
        newLine: emptyLine(),
        addingLine: false,
    });

    const {
        loading, saving, invoice, socid, refSupplier, type, libelle,
        datef, dateLimReglement, notePublic, notePrivate,
        lines = [], newLine, addingLine,
    } = states ?? {};

    useEffect(() => {
        const load = async () => {
            if (isCreate || !hasClient) return;
            set("loading", true);
            try {
                const data = await dbSI.get(id);
                set("invoice", data);
                set("socid", Number(data?.socid ?? data?.fkSoc ?? 0));
                set("refSupplier", data?.refSupplier ?? "");
                set("type", String(data?.type ?? "0"));
                set("libelle", data?.libelle ?? "");
                set("datef", toDateInput(data?.datef));
                set("dateLimReglement", toDateInput(data?.dateLimReglement));
                set("notePublic", data?.notePublic ?? "");
                set("notePrivate", data?.notePrivate ?? "");
                set("lines", Array.isArray(data?.lines) ? data.lines : []);
            } catch (err) {
                console.error("dbSI.get error", err);
                await alert({ type: "warning", title: "Erreur", message: "Chargement impossible." });
                navigate("/supplier-invoices", { replace: true });
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
        type: parseInt(type, 10) || 0,
        libelle,
        datef: dateInputToTs(datef),
        dateLimReglement: dateInputToTs(dateLimReglement),
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
                const data = await dbSI.create(payload);
                navigate(`/supplier-invoices/${data.id}`, { replace: true });
            } else {
                await dbSI.update(id, buildPayload());
                navigate(`/supplier-invoices/${id}`, { replace: true });
            }
        } catch (err) {
            console.error("dbSI.save error", err);
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
            const data = await dbSI.addLine(id, {
                description: newLine.description,
                qty: Number(newLine.qty || 0),
                subprice: Number(newLine.subprice || 0),
                tvaTx: Number(newLine.tvaTx || 0),
                remisePercent: Number(newLine.remisePercent || 0),
            });
            set("lines", Array.isArray(data?.lines) ? data.lines : []);
            set("newLine", emptyLine());
        } catch (err) {
            console.error("dbSI.addLine error", err);
            await alert({ type: "warning", title: "Erreur", message: "Ajout de ligne impossible." });
        } finally {
            set("addingLine", false);
        }
    };

    const handleDeleteLine = async (lineId) => {
        if (isCreate) {
            set("lines", lines.filter((l, idx) => (l.id ?? idx) !== lineId));
            return;
        }
        const ok = await confirm({ type: "delete", title: "Supprimer la ligne", message: "Confirmer ?" });
        if (!ok) return;
        try {
            const data = await dbSI.deleteLine(id, lineId);
            set("lines", Array.isArray(data?.lines) ? data.lines : []);
        } catch (err) {
            console.error("dbSI.deleteLine error", err);
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
                        onClick={() => navigate(isCreate ? "/supplier-invoices" : `/supplier-invoices/${id}`)}
                        className="p-2 -ml-2 md:hidden"
                        aria-label="Retour"
                    >
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isCreate ? "Nouvelle facture" : `Modifier ${invoice?.ref ?? ""}`}
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
                        <Select
                            labels={labelsWithFallback("Select")}
                            label="Type"
                            value={type}
                            options={TYPE_OPTIONS}
                            onChange={(value) => set("type", value)}
                        />
                        <Input
                            label="Libellé"
                            value={libelle}
                            onChange={(value) => set("libelle", value)}
                        />
                        <div className="flex flex-col gap-1">
                            <label htmlFor="si-datef" className="text-sm font-medium text-gray-600">Date facture</label>
                            <input
                                id="si-datef"
                                type="date"
                                value={datef || ""}
                                onChange={(e) => set("datef", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="si-date-lim" className="text-sm font-medium text-gray-600">Date limite règlement</label>
                            <input
                                id="si-date-lim"
                                type="date"
                                value={dateLimReglement || ""}
                                onChange={(e) => set("dateLimReglement", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="si-note-pub" className="text-sm font-medium text-gray-600">Note publique</label>
                            <textarea
                                id="si-note-pub"
                                value={notePublic || ""}
                                onChange={(e) => set("notePublic", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[80px]"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label htmlFor="si-note-priv" className="text-sm font-medium text-gray-600">Note privée</label>
                            <textarea
                                id="si-note-priv"
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

export default SupplierInvoiceEditPage;
