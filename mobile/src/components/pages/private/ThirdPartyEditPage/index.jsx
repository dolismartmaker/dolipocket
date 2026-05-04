import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaSave } from "react-icons/fa";

import { Page, Input, Select, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

const CLIENT_OPTIONS = [
    { value: 0, label: "Aucun" },
    { value: 1, label: "Client" },
    { value: 2, label: "Prospect" },
    { value: 3, label: "Client + Prospect" },
];

const FOURNISSEUR_OPTIONS = [
    { value: 0, label: "Non" },
    { value: 1, label: "Oui" },
];

export const ThirdPartyEditPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dbThirdParties = useDbThirdParties();
    const { alert } = useConfirm();

    const isEdit = !!id;

    // Pre-fill type from query params: ?type=client|fournisseur
    // ?back=1 means we should navigate(-1) after save (coming from a picker)
    const typeParam = searchParams.get("type");
    const returnBack = searchParams.get("back") === "1";
    const initialClient = typeParam === "fournisseur" ? 0 : 1;
    const initialFournisseur = typeParam === "fournisseur" ? 1 : 0;

    const { states, set } = useStates({
        form: {
            name: "",
            nameAlias: "",
            codeClient: "",
            codeFournisseur: "",
            client: initialClient,
            fournisseur: initialFournisseur,
            address: "",
            zip: "",
            town: "",
            countryCode: "",
            phone: "",
            email: "",
            url: "",
            siren: "",
            siret: "",
            ape: "",
            idprof4: "",
            tvaIntra: "",
            notePublic: "",
            notePrivate: "",
        },
        loading: isEdit,
        saving: false,
        error: null,
    });

    const { form, loading, saving, error } = states ?? {};

    const hasClient = !!dbThirdParties.get;

    useEffect(() => {
        if (!hasClient) return;
        if (!isEdit) return;
        loadThirdParty();
    }, [hasClient, id]);

    const loadThirdParty = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbThirdParties.get(id);
            set("form", {
                name: data?.name ?? "",
                nameAlias: data?.nameAlias ?? "",
                codeClient: data?.codeClient ?? "",
                codeFournisseur: data?.codeFournisseur ?? "",
                client: Number(data?.client ?? 0),
                fournisseur: Number(data?.fournisseur ?? 0),
                address: data?.address ?? "",
                zip: data?.zip ?? "",
                town: data?.town ?? "",
                countryCode: data?.countryCode ?? "",
                phone: data?.phone ?? "",
                email: data?.email ?? "",
                url: data?.url ?? "",
                siren: data?.siren ?? "",
                siret: data?.siret ?? "",
                ape: data?.ape ?? "",
                idprof4: data?.idprof4 ?? "",
                tvaIntra: data?.tvaIntra ?? "",
                notePublic: data?.notePublic ?? "",
                notePrivate: data?.notePrivate ?? "",
            });
        } catch (err) {
            console.error("dbThirdParties.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const setField = (field, value) => {
        set(`form.${field}`, value);
    };

    const handleBack = () => {
        navigate(-1);
    };

    const handleSave = async () => {
        if (!form?.name || !form.name.trim()) {
            await alert({
                type: "warning",
                title: "Nom requis",
                message: "Le nom du tiers est obligatoire.",
            });
            return;
        }

        set("saving", true);
        set("error", null);
        try {
            const payload = { ...form };
            // Coerce numeric fields
            payload.client = Number(payload.client ?? 0);
            payload.fournisseur = Number(payload.fournisseur ?? 0);

            let saved;
            if (isEdit) {
                saved = await dbThirdParties.update(id, payload);
            } else {
                saved = await dbThirdParties.create(payload);
            }
            const newId = saved?.id ?? id;
            if (returnBack) {
                navigate(-1);
            } else {
                navigate(`/thirdparties/${newId}`);
            }
        } catch (err) {
            console.error(`dbThirdParties.${isEdit ? "update" : "create"} error`, err);
            set("error", "Erreur d'enregistrement");
        } finally {
            set("saving", false);
        }
    };

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isEdit ? "Modifier le tiers" : "Nouveau tiers"}
                        </h1>
                    </div>
                    {/* Desktop save button in header */}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm disabled:opacity-50"
                    >
                        <FaSave className={saving ? "animate-pulse" : ""} />
                        {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                </div>
            </div>

            <div className="p-4 pb-32 md:pb-6 md:px-6 space-y-4 md:max-w-4xl md:mx-auto">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>
                )}

                {loading ? (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                ) : (
                    <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Identité</h2>
                            <Input
                                label="Nom *"
                                value={form?.name ?? ""}
                                onChange={(value) => setField("name", value)}
                            />
                            <Input
                                label="Nom commercial"
                                value={form?.nameAlias ?? ""}
                                onChange={(value) => setField("nameAlias", value)}
                            />
                            <Input
                                label="Code client"
                                value={form?.codeClient ?? ""}
                                onChange={(value) => setField("codeClient", value)}
                            />
                            <Input
                                label="Code fournisseur"
                                value={form?.codeFournisseur ?? ""}
                                onChange={(value) => setField("codeFournisseur", value)}
                            />
                            <Select
                                label="Type client"
                                value={form?.client ?? 0}
                                options={CLIENT_OPTIONS}
                                onChange={(value) => setField("client", Number(value))}
                            />
                            <Select
                                label="Fournisseur"
                                value={form?.fournisseur ?? 0}
                                options={FOURNISSEUR_OPTIONS}
                                onChange={(value) => setField("fournisseur", Number(value))}
                            />
                        </div>

                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Adresse</h2>
                            <Input
                                label="Adresse"
                                value={form?.address ?? ""}
                                onChange={(value) => setField("address", value)}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    label="Code postal"
                                    value={form?.zip ?? ""}
                                    onChange={(value) => setField("zip", value)}
                                />
                                <Input
                                    label="Ville"
                                    value={form?.town ?? ""}
                                    onChange={(value) => setField("town", value)}
                                />
                            </div>
                            <Input
                                label="Pays (code ISO)"
                                value={form?.countryCode ?? ""}
                                onChange={(value) => setField("countryCode", value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Contact</h2>
                            <Input
                                label="Téléphone"
                                value={form?.phone ?? ""}
                                onChange={(value) => setField("phone", value)}
                            />
                            <Input
                                label="Email"
                                value={form?.email ?? ""}
                                onChange={(value) => setField("email", value)}
                            />
                            <Input
                                label="Site web"
                                value={form?.url ?? ""}
                                onChange={(value) => setField("url", value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Fiscal</h2>
                            <Input
                                label="SIREN"
                                value={form?.siren ?? ""}
                                onChange={(value) => setField("siren", value)}
                            />
                            <Input
                                label="SIRET"
                                value={form?.siret ?? ""}
                                onChange={(value) => setField("siret", value)}
                            />
                            <Input
                                label="Code APE"
                                value={form?.ape ?? ""}
                                onChange={(value) => setField("ape", value)}
                            />
                            <Input
                                label="Idprof4"
                                value={form?.idprof4 ?? ""}
                                onChange={(value) => setField("idprof4", value)}
                            />
                            <Input
                                label="TVA intracommunautaire"
                                value={form?.tvaIntra ?? ""}
                                onChange={(value) => setField("tvaIntra", value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3 md:col-span-2">
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Notes</h2>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-600">Note publique</label>
                                <textarea
                                    value={form?.notePublic ?? ""}
                                    onChange={(e) => setField("notePublic", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[100px] resize-y"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-gray-600">Note privée</label>
                                <textarea
                                    value={form?.notePrivate ?? ""}
                                    onChange={(e) => setField("notePrivate", e.target.value)}
                                    className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[100px] resize-y"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom save bar - mobile only */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-10 md:hidden">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="w-full py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                >
                    <FaSave className={saving ? "animate-pulse" : ""} />
                    {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
            </div>
        </Page>
    );
};
