import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaArrowLeft, FaSave, FaBox, FaWrench } from "react-icons/fa";

import { Page, Input, Button, useStates } from "@cap-rel/smartcommon";

import { useDbProducts } from "src/db/stores/products/useDbProducts";

/**
 * ProductEditPage: create or edit a product / service.
 *
 * Route patterns supported:
 *   - /products/new        : create mode (no id param)
 *   - /products/:id/edit   : update mode
 */
export const ProductEditPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id;

    const dbProducts = useDbProducts();
    const hasClient = !!dbProducts.list;

    const { states, set } = useStates({
        form: {
            ref: "",
            label: "",
            description: "",
            type: 0,
            price: 0,
            tvaTx: 20,
            status: 1,
            statusBuy: 1,
            barcode: "",
            weight: "",
            length: "",
            width: "",
            height: "",
        },
        loading: isEdit,
        saving: false,
        error: null,
    });

    const { form = {}, loading, saving, error } = states ?? {};

    useEffect(() => {
        if (hasClient && isEdit) {
            loadProduct();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadProduct = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbProducts.get(id);
            set("form", {
                ref: data?.ref ?? "",
                label: data?.label ?? "",
                description: data?.description ?? "",
                type: Number(data?.type ?? 0),
                price: Number(data?.price ?? 0),
                tvaTx: Number(data?.tvaTx ?? 0),
                status: Number(data?.status ?? 1),
                statusBuy: Number(data?.statusBuy ?? 1),
                barcode: data?.barcode ?? "",
                weight: data?.weight ?? "",
                length: data?.length ?? "",
                width: data?.width ?? "",
                height: data?.height ?? "",
            });
        } catch (err) {
            console.error("dbProducts.get error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const setField = (field, value) => set(`form.${field}`, value);

    const handleBack = () => {
        if (isEdit) {
            navigate(`/products/${id}`);
        } else {
            navigate("/products");
        }
    };

    const handleSave = async () => {
        if (!form?.ref?.trim() || !form?.label?.trim()) {
            set("error", "Reference et libelle sont obligatoires");
            return;
        }
        set("saving", true);
        set("error", null);

        const payload = {
            ref: form.ref.trim(),
            label: form.label.trim(),
            description: form.description ?? "",
            type: Number(form.type ?? 0),
            price: Number(form.price ?? 0),
            tvaTx: Number(form.tvaTx ?? 0),
            status: Number(form.status ?? 1),
            statusBuy: Number(form.statusBuy ?? 1),
            barcode: form.barcode ?? "",
        };
        if (form.weight !== "") payload.weight = Number(form.weight);
        if (form.length !== "") payload.length = Number(form.length);
        if (form.width !== "") payload.width = Number(form.width);
        if (form.height !== "") payload.height = Number(form.height);

        try {
            if (isEdit) {
                await dbProducts.update(id, payload);
                navigate(`/products/${id}`, { replace: true });
            } else {
                const created = await dbProducts.create(payload);
                if (created?.id) {
                    navigate(`/products/${created.id}`, { replace: true });
                } else {
                    navigate("/products", { replace: true });
                }
            }
        } catch (err) {
            console.error("Save product error", err);
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
                            {isEdit ? "Modifier le produit" : "Nouveau produit"}
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

                    <div className="flex gap-2">
                        <button
                            onClick={() => setField("type", 0)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                                Number(form.type) === 0 ? "bg-primary text-white" : "bg-white text-gray-700 border border-gray-200"
                            }`}
                        >
                            <FaBox /> Produit
                        </button>
                        <button
                            onClick={() => setField("type", 1)}
                            className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                                Number(form.type) === 1 ? "bg-primary text-white" : "bg-white text-gray-700 border border-gray-200"
                            }`}
                        >
                            <FaWrench /> Service
                        </button>
                    </div>

                    <div className="md:grid md:grid-cols-2 md:gap-3 flex flex-col gap-3">
                        <Input
                            label="Reference"
                            value={form.ref ?? ""}
                            onChange={(value) => setField("ref", value)}
                        />
                        <Input
                            label="Libelle"
                            value={form.label ?? ""}
                            onChange={(value) => setField("label", value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-600">Description</label>
                        <textarea
                            value={form.description ?? ""}
                            onChange={(e) => setField("description", e.target.value)}
                            className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[100px] resize-none"
                            placeholder="Description du produit..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Prix HT"
                            value={String(form.price ?? "")}
                            onChange={(value) => setField("price", value)}
                            inputProps={{ type: "number", step: "0.01" }}
                        />
                        <Input
                            label="TVA (%)"
                            value={String(form.tvaTx ?? "")}
                            onChange={(value) => setField("tvaTx", value)}
                            inputProps={{ type: "number", step: "0.01" }}
                        />
                    </div>

                    <Input
                        label="Code-barres"
                        value={form.barcode ?? ""}
                        onChange={(value) => setField("barcode", value)}
                    />

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-600">Statuts</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setField("status", Number(form.status) === 1 ? 0 : 1)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                                    Number(form.status) === 1 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                                }`}
                            >
                                {Number(form.status) === 1 ? "En vente" : "Pas en vente"}
                            </button>
                            <button
                                onClick={() => setField("statusBuy", Number(form.statusBuy) === 1 ? 0 : 1)}
                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                                    Number(form.statusBuy) === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                                }`}
                            >
                                {Number(form.statusBuy) === 1 ? "Achetable" : "Non achetable"}
                            </button>
                        </div>
                    </div>

                    {Number(form.type) === 0 && (
                        <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col gap-3">
                            <div className="text-xs text-gray-400 uppercase">Dimensions</div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    label="Poids (kg)"
                                    value={String(form.weight ?? "")}
                                    onChange={(value) => setField("weight", value)}
                                    inputProps={{ type: "number", step: "0.01" }}
                                />
                                <Input
                                    label="Longueur"
                                    value={String(form.length ?? "")}
                                    onChange={(value) => setField("length", value)}
                                    inputProps={{ type: "number", step: "0.01" }}
                                />
                                <Input
                                    label="Largeur"
                                    value={String(form.width ?? "")}
                                    onChange={(value) => setField("width", value)}
                                    inputProps={{ type: "number", step: "0.01" }}
                                />
                                <Input
                                    label="Hauteur"
                                    value={String(form.height ?? "")}
                                    onChange={(value) => setField("height", value)}
                                    inputProps={{ type: "number", step: "0.01" }}
                                />
                            </div>
                        </div>
                    )}

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

export default ProductEditPage;
