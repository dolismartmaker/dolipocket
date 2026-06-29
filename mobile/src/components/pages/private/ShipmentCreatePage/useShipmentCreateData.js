import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useStates } from "@cap-rel/smartcommon";

import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { useDbWarehouses } from "src/db/stores/warehouses/useDbWarehouses";
import { useDbShipments } from "src/db/stores/shipments/useDbShipments";

// Data layer for the "create shipment from order" flow (route /orders/:id/ship).
//
// Mirrors expedition/card.php: the user picks, per shippable order line, a
// warehouse and a quantity to ship, then POST /shipment builds the Expedition
// linked to the order. Only product lines (productType 0) with a product are
// shippable -- services / section lines are excluded, exactly like the native
// Expedition::create() loop.

export const useShipmentCreateData = () => {
    const navigate = useNavigate();
    const { id: orderId } = useParams();
    const dbOrders = useDbOrders();
    const dbWarehouses = useDbWarehouses();
    const dbShipments = useDbShipments();
    const hasClient = !!dbOrders.get;

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
                dbOrders.get(orderId),
                dbWarehouses.list({ perPage: 1000 }),
            ]);
            if (!ord) {
                set("error", "Commande introuvable");
                set("loading", false);
                return;
            }
            const warehouseList = Array.isArray(whs) ? whs : [];
            const defaultWarehouseId = warehouseList.length > 0 ? warehouseList[0].id : 0;

            // Only stockable product lines are shippable.
            const shippable = (Array.isArray(ord.lines) ? ord.lines : [])
                .filter((l) => Number(l.productType) === 0 && Number(l.fkProduct) > 0)
                .map((l) => ({
                    fkOriginLine: l.id,
                    label: l.label || l.description || `Ligne #${l.id}`,
                    qtyOrdered: Number(l.qty ?? 0),
                    qty: String(Number(l.qty ?? 0)),
                    entrepotId: defaultWarehouseId,
                }));

            set("order", ord);
            set("warehouses", warehouseList);
            set("lines", shippable);
        } catch (err) {
            console.error("useShipmentCreateData.load error", err);
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

    const goBack = () => navigate(`/orders/${orderId}`);

    const submit = async () => {
        const payloadLines = (lines ?? [])
            .map((l) => ({
                fkOriginLine: Number(l.fkOriginLine),
                entrepotId: Number(l.entrepotId) || 0,
                qty: Number(l.qty),
            }))
            .filter((l) => Number.isFinite(l.qty) && l.qty > 0);

        if (payloadLines.length === 0) {
            toast.error("Renseignez au moins une quantité à expédier");
            return;
        }
        if (payloadLines.some((l) => l.entrepotId <= 0)) {
            toast.error("Sélectionnez un entrepôt pour chaque ligne expédiée");
            return;
        }

        set("submitting", true);
        try {
            const created = await dbShipments.createFromOrder({
                orderId,
                lines: payloadLines,
                dateDelivery: dateDelivery || undefined,
                trackingNumber: trackingNumber || undefined,
            });
            toast.success("Expédition créée");
            if (created?.id) {
                navigate(`/shipments/${created.id}`);
            } else {
                navigate("/shipments");
            }
        } catch (err) {
            console.error("createFromOrder error", err);
            toast.error("Création de l'expédition impossible");
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
