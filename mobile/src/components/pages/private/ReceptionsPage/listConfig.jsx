import {
    FaEye, FaTrash,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop receptions DataTable.
// Cf DATATABLE_SPEC.md §13 -- the server catalog is the source of truth.
// Reception::$fields is empty, so the catalog reports every column as
// defaultVisible:false; the overrides below force the useful columns visible.

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

export const receptionsListConfig = {
    storageKey: "dolipocket.list.receptions",
    rowKey: (row) => row.id,
    defaultSort: { col: "dateReception", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher une réception...",
    },

    columnsOverrides: {
        ref:            { defaultVisible: true,  defaultWidth: 160 },
        refSupplier:    { defaultVisible: false, defaultWidth: 140 },
        socid:          { defaultVisible: true,  defaultWidth: 120, formatter: (v) => (v ? `#${v}` : "") },
        dateReception:  { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        dateDelivery:   { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        trackingNumber: { defaultVisible: false, defaultWidth: 150 },
        totalHt:        { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        totalTtc:       { defaultVisible: false, defaultWidth: 130, formatter: fmtAmount },
        statut:         {
            defaultVisible: true, defaultWidth: 110,
            formatter: (v) => <StatusPill feature="reception" status={v} />,
            exportFormatter: (v) => getStatusInfo("reception", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/receptions/${row.id}`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "reception.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cette réception ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`reception/${row.id}`).json();
                    ctx.toast.success("Réception supprimée");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete reception", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    // No bulk delete endpoint for receptions. Export actions only.
    bulkActions: [
        { key: "export-csv", label: "Exporter CSV", icon: FaFileCsv,
          run: (_rows, ctx) => ctx.exportRows("csv") },
        { key: "export-xls", label: "Exporter XLS", icon: FaFileExcel,
          run: (_rows, ctx) => ctx.exportRows("xls") },
        { key: "export-ods", label: "Exporter ODS", icon: FaFileLines,
          run: (_rows, ctx) => ctx.exportRows("ods") },
    ],

    // Receptions are created from a supplier order, never from a blank form.
    headerActions: [],
};
