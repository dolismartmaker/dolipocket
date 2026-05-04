import { useEffect } from "react";
import {
    FaFileLines, FaCartShopping, FaFileInvoice,
} from "react-icons/fa6";

import { useStates, useApi } from "@cap-rel/smartcommon";

import { useDbInvoices } from "src/db/stores/invoices/useDbInvoices";
import { useDbProposals } from "src/db/stores/proposals/useDbProposals";
import { useDbOrders } from "src/db/stores/orders/useDbOrders";
import { useDbSupplierInvoices } from "src/db/stores/supplierInvoices/useDbSupplierInvoices";
import { useDbSupplierOrders } from "src/db/stores/supplierOrders/useDbSupplierOrders";

// -- formatting helpers (presentational but pure, kept here so both
// mobile and desktop views render identical numbers/dates).
export const fmt = (val) => {
    const n = Number(val ?? 0);
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

const sum = (items, field) =>
    (items ?? []).reduce((acc, it) => acc + Number(it[field] ?? 0), 0);

const INVOICE_STATUS = { DRAFT: 0, VALIDATED: 1, PAID: 2, ABANDONED: 3 };
const PROPOSAL_STATUS = { DRAFT: 0, VALIDATED: 1, SIGNED: 2, REFUSED: 3, BILLED: 4 };
const ORDER_STATUS = { DRAFT: 0, VALIDATED: 1, SHIPPED: 2, BILLED: 3 };

const PROPOSAL_STATUS_LABEL = { 0: "Brouillon", 1: "Validé", 2: "Signé", 3: "Refusé", 4: "Facturé" };
const ORDER_STATUS_LABEL = { 0: "Brouillon", 1: "Validé", 2: "Expédié", 3: "Facturé" };
const INVOICE_STATUS_LABEL = { 0: "Brouillon", 1: "Validée", 2: "Réglée", 3: "Abandonnée" };

// Shared by both views. Passed by reference, never mutated.
export const useHomeData = () => {
    const { user } = useApi();
    const dbInvoices = useDbInvoices();
    const dbProposals = useDbProposals();
    const dbOrders = useDbOrders();
    const dbSI = useDbSupplierInvoices();
    const dbSO = useDbSupplierOrders();
    const hasClient = !!dbInvoices.list;

    const { states, set } = useStates({
        loading: true,
        invoices: [],
        proposals: [],
        orders: [],
        supplierInvoices: [],
        supplierOrders: [],
    });

    const {
        loading,
        invoices,
        proposals,
        orders,
        supplierInvoices,
        supplierOrders,
    } = states ?? {};

    useEffect(() => {
        if (!hasClient) return;
        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient]);

    const loadDashboard = async () => {
        set("loading", true);
        try {
            const [inv, prop, ord, sinv, sord] = await Promise.all([
                dbInvoices.list({}).catch(() => []),
                dbProposals.list({}).catch(() => []),
                dbOrders.list({}).catch(() => []),
                dbSI.list({}).catch(() => []),
                dbSO.list({}).catch(() => []),
            ]);
            set("invoices",         Array.isArray(inv)  ? inv  : []);
            set("proposals",        Array.isArray(prop) ? prop : []);
            set("orders",           Array.isArray(ord)  ? ord  : []);
            set("supplierInvoices", Array.isArray(sinv) ? sinv : []);
            set("supplierOrders",   Array.isArray(sord) ? sord : []);
        } finally {
            set("loading", false);
        }
    };

    // -- derived KPIs -------------------------------------------------------

    const unpaidInvoices = (invoices ?? []).filter(
        i => Number(i.statut) === INVOICE_STATUS.VALIDATED && Number(i.paye) === 0,
    );
    const unpaidTotal = sum(unpaidInvoices, "totalTtc");

    const openProposals = (proposals ?? []).filter(
        p => Number(p.statut) === PROPOSAL_STATUS.VALIDATED,
    );
    const openProposalsTotal = sum(openProposals, "totalTtc");

    const pendingOrders = (orders ?? []).filter(
        o => Number(o.statut) === ORDER_STATUS.VALIDATED,
    );
    const pendingOrdersTotal = sum(pendingOrders, "totalTtc");

    const unpaidSupplier = (supplierInvoices ?? []).filter(
        i => Number(i.statut) === 1 && Number(i.paye) === 0,
    );
    const unpaidSupplierTotal = sum(unpaidSupplier, "totalTtc");

    const now = Math.floor(Date.now() / 1000);
    const overdueInvoices = unpaidInvoices.filter(i => {
        const due = Number(i.dateLimReglement);
        return due > 0 && due < now;
    });
    const overdueTotal = sum(overdueInvoices, "totalTtc");

    // Recent items across all types for the activity feed.
    const recentItems = [
        ...(invoices ?? []).slice(0, 5).map(i => ({
            type: "invoice", id: i.id, ref: i.ref, amount: i.totalTtc,
            date: i.datef, statut: i.statut, paye: i.paye,
            dateLimReglement: i.dateLimReglement,
            label: INVOICE_STATUS_LABEL[i.statut] ?? "?",
            icon: FaFileInvoice, to: `/invoices/${i.id}`,
        })),
        ...(proposals ?? []).slice(0, 5).map(p => ({
            type: "proposal", id: p.id, ref: p.ref, amount: p.totalTtc,
            date: p.datep, statut: p.statut,
            label: PROPOSAL_STATUS_LABEL[p.statut] ?? "?",
            icon: FaFileLines, to: `/proposals/${p.id}`,
        })),
        ...(orders ?? []).slice(0, 5).map(o => ({
            type: "order", id: o.id, ref: o.ref, amount: o.totalTtc,
            date: o.dateCommande, statut: o.statut,
            label: ORDER_STATUS_LABEL[o.statut] ?? "?",
            icon: FaCartShopping, to: `/orders/${o.id}`,
        })),
    ].sort((a, b) => Number(b.date ?? 0) - Number(a.date ?? 0)).slice(0, 10);

    const totalDocuments =
        (invoices?.length ?? 0)
        + (proposals?.length ?? 0)
        + (orders?.length ?? 0);

    return {
        user,
        loading,
        // raw lists (used by recent activity counters)
        invoices,
        proposals,
        orders,
        // KPIs
        unpaidInvoices,
        unpaidTotal,
        openProposals,
        openProposalsTotal,
        pendingOrders,
        pendingOrdersTotal,
        unpaidSupplier,
        unpaidSupplierTotal,
        overdueInvoices,
        overdueTotal,
        // activity feed
        recentItems,
        totalDocuments,
        now,
        // status constants for view-side rendering decisions
        INVOICE_STATUS,
    };
};
