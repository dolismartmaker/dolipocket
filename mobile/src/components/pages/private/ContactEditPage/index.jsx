import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowLeft, FaSave } from "react-icons/fa";

import { Page, Input, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { SearchPicker } from "../../../common/SearchPicker";

export const ContactEditPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const dbContacts = useDbContacts();
    const { alert } = useConfirm();

    const isEdit = !!id;
    const initialSocid = searchParams.get("socid");

    const { states, set } = useStates({
        form: {
            civility: "",
            firstname: "",
            lastname: "",
            fkSoc: initialSocid ? Number(initialSocid) : 0,
            address: "",
            zip: "",
            town: "",
            countryCode: "",
            phonePro: "",
            phoneMobile: "",
            fax: "",
            email: "",
            statut: 1,
            poste: "",
            notePublic: "",
            notePrivate: "",
        },
        loading: isEdit,
        saving: false,
        error: null,
    });

    const { form, loading, saving, error } = states ?? {};

    const hasClient = !!dbContacts.get;

    useEffect(() => {
        if (!hasClient) return;
        if (!isEdit) return;
        loadContact();
    }, [hasClient, id]);

    const loadContact = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbContacts.get(id);
            set("form", {
                civility: data?.civility ?? "",
                firstname: data?.firstname ?? "",
                lastname: data?.lastname ?? "",
                fkSoc: Number(data?.fkSoc ?? 0),
                address: data?.address ?? "",
                zip: data?.zip ?? "",
                town: data?.town ?? "",
                countryCode: data?.countryCode ?? "",
                phonePro: data?.phonePro ?? "",
                phoneMobile: data?.phoneMobile ?? "",
                fax: data?.fax ?? "",
                email: data?.email ?? "",
                statut: Number(data?.statut ?? 1),
                poste: data?.poste ?? "",
                notePublic: data?.notePublic ?? "",
                notePrivate: data?.notePrivate ?? "",
            });
        } catch (err) {
            console.error("dbContacts.get error", err);
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
        const lastnameOk = form?.lastname && form.lastname.trim();
        const firstnameOk = form?.firstname && form.firstname.trim();
        if (!lastnameOk && !firstnameOk) {
            await alert({
                type: "warning",
                title: "Nom requis",
                message: "Indiquez au moins un nom ou un prénom.",
            });
            return;
        }

        set("saving", true);
        set("error", null);
        try {
            const payload = { ...form };
            payload.fkSoc = Number(payload.fkSoc ?? 0);
            payload.statut = Number(payload.statut ?? 1);

            let saved;
            if (isEdit) {
                saved = await dbContacts.update(id, payload);
            } else {
                saved = await dbContacts.create(payload);
            }
            const newId = saved?.id ?? id;
            navigate(`/contacts/${newId}`);
        } catch (err) {
            console.error(`dbContacts.${isEdit ? "update" : "create"} error`, err);
            set("error", "Erreur d'enregistrement");
        } finally {
            set("saving", false);
        }
    };

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isEdit ? "Modifier le contact" : "Nouveau contact"}
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
                                label="Civilité"
                                value={form?.civility ?? ""}
                                onChange={(value) => setField("civility", value)}
                            />
                            <Input
                                label="Prénom"
                                value={form?.firstname ?? ""}
                                onChange={(value) => setField("firstname", value)}
                            />
                            <Input
                                label="Nom"
                                value={form?.lastname ?? ""}
                                onChange={(value) => setField("lastname", value)}
                            />
                            <SearchPicker
                                label="Tiers"
                                value={form?.fkSoc || 0}
                                onChange={(id) => setField("fkSoc", id)}
                                endpoint="thirdparty"
                                placeholder="Rechercher un tiers..."
                                renderItem={(item) => ({
                                    title: item.nom || item.name || `#${item.id}`,
                                    subtitle: [item.town, item.country_code].filter(Boolean).join(", "),
                                })}
                                onCreateNew={() => navigate("/thirdparties/new?back=1")}
                                createLabel="Nouveau tiers"
                            />
                            <Input
                                label="Fonction (poste)"
                                value={form?.poste ?? ""}
                                onChange={(value) => setField("poste", value)}
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
                            <h2 className="text-sm font-semibold text-gray-700 uppercase">Coordonnées</h2>
                            <Input
                                label="Téléphone professionnel"
                                value={form?.phonePro ?? ""}
                                onChange={(value) => setField("phonePro", value)}
                            />
                            <Input
                                label="Téléphone mobile"
                                value={form?.phoneMobile ?? ""}
                                onChange={(value) => setField("phoneMobile", value)}
                            />
                            <Input
                                label="Fax"
                                value={form?.fax ?? ""}
                                onChange={(value) => setField("fax", value)}
                            />
                            <Input
                                label="Email"
                                value={form?.email ?? ""}
                                onChange={(value) => setField("email", value)}
                            />
                        </div>

                        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 space-y-3">
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
