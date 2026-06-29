import {
    FaEye, FaTrash,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop shipments DataTable.
// Cf DATATABLE_SPEC.md §13 -- the server catalog is the source of truth for the
// column list. Expedition::$fields is empty, so the catalog reports every
// column as defaultVisible:false; the overrides below force the useful columns
// visible and attach the date / amount / status formatters.

const fmtDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

const fmtAmount = (v) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const shipmentsListConfig = {
    storageKey: "dolipocket.list.shipments",
    rowKey: (row) => row.id,
    defaultSort: { col: "dateExpedition", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher une expédition...",
    },

    columnsOverrides: {
        ref:            { defaultVisible: true,  defaultWidth: 160 },
        refCustomer:    { defaultVisible: false, defaultWidth: 140 },
        socid:          { defaultVisible: true,  defaultWidth: 120, formatter: (v) => (v ? `#${v}` : "") },
        dateExpedition: { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        dateDelivery:   { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        trackingNumber: { defaultVisible: false, defaultWidth: 150 },
        totalHt:        { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        totalTtc:       { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        statut:         {
            defaultVisible: true, defaultWidth: 110,
            formatter: (v) => <StatusPill feature="shipment" status={v} />,
            exportFormatter: (v) => getStatusInfo("shipment", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/shipments/${row.id}`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "shipment.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cette expédition ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`shipment/${row.id}`).json();
                    ctx.toast.success("Expédition supprimée");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete shipment", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    // No bulk delete endpoint for shipments (each deletion is reviewed
    // individually). Export actions only on the bulk bar.
    bulkActions: [
        { key: "export-csv", label: "Exporter CSV", icon: FaFileCsv,
          run: (_rows, ctx) => ctx.exportRows("csv") },
        { key: "export-xls", label: "Exporter XLS", icon: FaFileExcel,
          run: (_rows, ctx) => ctx.exportRows("xls") },
        { key: "export-ods", label: "Exporter ODS", icon: FaFileLines,
          run: (_rows, ctx) => ctx.exportRows("ods") },
    ],

    // Shipments are created from a validated order (see the order detail page),
    // never from a blank form -- so there is no "new" header action here.
    headerActions: [],
};
