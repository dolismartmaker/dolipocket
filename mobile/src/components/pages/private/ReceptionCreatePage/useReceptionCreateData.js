import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbReceptions } from "src/db/stores/receptions/useDbReceptions";

// Data layer for the "create reception from supplier order" flow
// (route /supplier-orders/:id/reception).
//
// Mirrors reception/card.php: the user picks, per ordered product line, a
// warehouse and a quantity to receive, then POST /reception builds the
// Reception linked to the supplier order. Only product lines (productType 0)
// with a product are receivable. The supplier order line price is forwarded as
// the line cost_price (valorisation), as Dolibarr does.

export const useReceptionCreateData = () => {
    const navigate = useNavigate();
    const { id: orderId } = useParams();
    const dbSupplierOrders = useDbSupplierOrders();
    const dbWarehouses = useDbWarehouses();
    const dbReceptions = useDbReceptions();
    const hasClient = !!dbSupplierOrders.get;

    const { states, set } = useStates({
        order: null,
        warehouses: [],
        lines: [],
        loading: true,
        error: null,
        submitting: false,
        dateDelivery: "",
        trackingNumber: "",
    });

    const { order, warehouses, lines, loading, error, submitting, dateDelivery, trackingNumber } = states ?? {};

    useEffect(() => {
        if (hasClient && orderId) {
            load();
        }
    }, [hasClient, orderId]);

    const load = async () => {
        set("loading", true);
        set("error", null);
        try {
            const [ord, whs] = await Promise.all([
                dbSupplierOrders.get(orderId),
                dbWarehouses.list({ perPage: 1000 }),
            ]);
            if (!ord) {
                set("error", "Commande fournisseur introuvable");
                set("loading", false);
                return;
            }
            const warehouseList = Array.isArray(whs) ? whs : [];
            const defaultWarehouseId = warehouseList.length > 0 ? warehouseList[0].id : 0;

            const receivable = (Array.isArray(ord.lines) ? ord.lines : [])
                .filter((l) => Number(l.productType) === 0 && Number(l.fkProduct) > 0)
                .map((l) => ({
                    fkCommandefourndet: l.id,
                    label: l.label || l.description || `Ligne #${l.id}`,
                    qtyOrdered: Number(l.qty ?? 0),
                    qty: String(Number(l.qty ?? 0)),
                    costPrice: Number(l.subprice ?? 0),
                    entrepotId: defaultWarehouseId,
                }));

            set("order", ord);
            set("warehouses", warehouseList);
            set("lines", receivable);
        } catch (err) {
            console.error("useReceptionCreateData.load error", err);
            set("error", "Erreur de chargement");
        } finally {
            set("loading", false);
        }
    };

    const setLineQty = (idx, value) => {
        const next = (lines ?? []).map((l, i) => (i === idx ? { ...l, qty: value } : l));
        set("lines", next);
    };

    const setLineWarehouse = (idx, value) => {
        const next = (lines ?? []).map((l, i) => (i === idx ? { ...l, entrepotId: Number(value) || 0 } : l));
        set("lines", next);
    };

    const goBack = () => navigate(`/supplier-orders/${orderId}`);

    const submit = async () => {
        const payloadLines = (lines ?? [])
            .map((l) => ({
                fkCommandefourndet: Number(l.fkCommandefourndet),
                entrepotId: Number(l.entrepotId) || 0,
                qty: Number(l.qty),
                costPrice: Number(l.costPrice) || 0,
            }))
            .filter((l) => Number.isFinite(l.qty) && l.qty > 0);

        if (payloadLines.length === 0) {
            toast.error("Renseignez au moins une quantité à recevoir");
            return;
        }
        if (payloadLines.some((l) => l.entrepotId <= 0)) {
            toast.error("Sélectionnez un entrepôt pour chaque ligne reçue");
            return;
        }

        set("submitting", true);
        try {
            const created = await dbReceptions.createFromOrder({
                orderId,
                lines: payloadLines,
                dateDelivery: dateDelivery || undefined,
                trackingNumber: trackingNumber || undefined,
            });
            toast.success("Réception créée");
            if (created?.id) {
                navigate(`/receptions/${created.id}`);
            } else {
                navigate("/receptions");
            }
        } catch (err) {
            console.error("createFromOrder error", err);
            toast.error("Création de la réception impossible");
            set("submitting", false);
        }
    };

    return {
        order,
        warehouses,
        lines,
        loading,
        error,
        submitting,
        dateDelivery,
        trackingNumber,
        set,
        setLineQty,
        setLineWarehouse,
        goBack,
        submit,
    };
};
