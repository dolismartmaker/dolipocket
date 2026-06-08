import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaSave } from "react-icons/fa";

import { Page, Input, Button, useStates } from "@cap-rel/smartcommon";

import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";

/**
 * WarehouseEditPage: create or edit a warehouse.
 *
 * Route patterns supported:
 *   - /warehouses/new        : create mode
 *   - /warehouses/:id/edit   : update mode
 */
export const WarehouseEditPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;

    const dbWarehouses = useDbWarehouses();
    const hasClient = !!dbWarehouses.list;

    const { states, set } = useStates({
        form: {
            label: "",
            description: "",
            lieu: "",
            address: "",
            zip: "",
            town: "",
            phone: "",
            fax: "",
            statut: 1,
        },
        loading: isEdit,
        saving: false,
        error: null,
    });

    const { form = {}, loading, saving, error } = states ?? {};

    useEffect(() => {
        if (hasClient && isEdit) {
            loadWarehouse();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadWarehouse = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbWarehouses.get(id);
            set("form", {
                label: data?.label ?? data?.ref ?? "",
                description: data?.description ?? "",
                lieu: data?.lieu ?? "",
                address: data?.address ?? "",
                zip: data?.zip ?? "",
                town: data?.town ?? "",
                phone: data?.phone ?? "",
                fax: data?.fax ?? "",
                statut: Number(data?.statut ?? 1),
            });
        } catch (err) {
            console.error("dbWarehouses.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const setField = (field, value) => set(`form.${field}`, value);

    const handleBack = () => {
        if (isEdit) {
            navigate(`/warehouses/${id}`);
        } else {
            navigate("/warehouses");
        }
    };

    const handleSave = async () => {
        if (!form?.label?.trim()) {
            set("error", "Le libelle est obligatoire");
            return;
        }
        set("saving", true);
        set("error", null);

        const payload = {
            label: form.label.trim(),
            description: form.description ?? "",
            lieu: form.lieu ?? "",
            address: form.address ?? "",
            zip: form.zip ?? "",
            town: form.town ?? "",
            phone: form.phone ?? "",
            fax: form.fax ?? "",
            statut: Number(form.statut ?? 1),
        };

        try {
            if (isEdit) {
                await dbWarehouses.update(id, payload);
                navigate(`/warehouses/${id}`, { replace: true });
            } else {
                const created = await dbWarehouses.create(payload);
                if (created?.id) {
                    navigate(`/warehouses/${created.id}`, { replace: true });
                } else {
                    navigate("/warehouses", { replace: true });
                }
            }
        } catch (err) {
            console.error("Save warehouse error", err);
            set("error", "Echec de l'enregistrement");
        } finally {
            set("saving", false);
        }
    };

    return (
        <Page contentProps={{ className: "pb-app-base md:pb-6 bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isEdit ? "Modifier l'entrepot" : "Nouvel entrepot"}
                        </h1>
                    </div>
                    {/* Desktop save button in header */}
                    <Button
                        onClick={handleSave}
                        loading={saving}
                        icon={FaSave}
                        buttonProps={{ className: "hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm" }}
                    >
                        Enregistrer
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Chargement...</div>
            ) : (
                <div className="p-4 md:px-6 md:max-w-4xl md:mx-auto flex flex-col gap-3">
                    {error && (
                        <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
                    )}

                    <div className="md:grid md:grid-cols-2 md:gap-3 flex flex-col gap-3">
                        <Input
                            label="Libelle"
                            value={form.label ?? ""}
                            onChange={(value) => setField("label", value)}
                        />

                        <Input
                            label="Lieu (resume)"
                            value={form.lieu ?? ""}
                            onChange={(value) => setField("lieu", value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-600">Description</label>
                        <textarea
                            value={form.description ?? ""}
                            onChange={(e) => setField("description", e.target.value)}
                            className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[80px] resize-none"
                            placeholder="Description de l'entrepot..."
                        />
                    </div>

                    <Input
                        label="Adresse"
                        value={form.address ?? ""}
                        onChange={(value) => setField("address", value)}
                    />

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Code postal"
                            value={form.zip ?? ""}
                            onChange={(value) => setField("zip", value)}
                        />
                        <Input
                            label="Ville"
                            value={form.town ?? ""}
                            onChange={(value) => setField("town", value)}
                        />
                    </div>

                    <div className="md:grid md:grid-cols-2 md:gap-3 flex flex-col gap-3">
                        <Input
                            label="Telephone"
                            value={form.phone ?? ""}
                            onChange={(value) => setField("phone", value)}
                        />
                        <Input
                            label="Fax"
                            value={form.fax ?? ""}
                            onChange={(value) => setField("fax", value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-600">Statut</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setField("statut", 1)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                                    Number(form.statut) === 1 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                }`}
                            >
                                Ouvert
                            </button>
                            <button
                                onClick={() => setField("statut", 0)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                                    Number(form.statut) === 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                                }`}
                            >
                                Ferme
                            </button>
                        </div>
                    </div>

                    {/* Mobile save button */}
                    <div className="md:hidden">
                        <Button
                            onClick={handleSave}
                            loading={saving}
                            icon={FaSave}
                            buttonProps={{ className: "mt-3 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium w-full" }}
                        >
                            Enregistrer
                        </Button>
                    </div>
                </div>
            )}
        </Page>
    );
};

export default WarehouseEditPage;
