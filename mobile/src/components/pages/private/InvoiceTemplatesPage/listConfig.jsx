import {
    FaEye, FaTrash,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop recurring invoice templates DataTable.

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

const UNIT_LABELS = { d: "jour(s)", w: "semaine(s)", m: "mois", y: "an(s)" };

export const fmtFrequency = (row) => {
    const f = Number(row?.frequency ?? 0);
    if (f <= 0) return "Manuel";
    const unit = UNIT_LABELS[row?.unitFrequency] || row?.unitFrequency || "";
    return `Tous les ${f} ${unit}`.trim();
};

export const invoiceTemplatesListConfig = {
    storageKey: "dolipocket.list.invoicerecs",
    rowKey: (row) => row.id,
    defaultSort: { col: "title", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un modèle...",
    },

    columnsOverrides: {
        title:     { defaultVisible: true,  defaultWidth: 220 },
        ref:       { defaultVisible: false, defaultWidth: 180 },
        socid:     { defaultVisible: true,  defaultWidth: 120, formatter: (v) => (v ? `#${v}` : "") },
        frequency: { defaultVisible: true,  defaultWidth: 160, formatter: (_v, row) => fmtFrequency(row) },
        dateWhen:  { defaultVisible: true,  defaultWidth: 130, formatter: fmtDate },
        nbGenDone: { defaultVisible: true,  defaultWidth: 110 },
        totalTtc:  { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        suspended: {
            defaultVisible: true, defaultWidth: 110,
            formatter: (v) => <StatusPill feature="invoicerec" status={v} />,
            exportFormatter: (v) => getStatusInfo("invoicerec", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/invoice-templates/${row.id}`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "invoicerec.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce modèle récurrent ?",
                message: row?.title,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`invoicerec/${row.id}`).json();
                    ctx.toast.success("Modèle supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete invoice template", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        { key: "export-csv", label: "Exporter CSV", icon: FaFileCsv,
          run: (_rows, ctx) => ctx.exportRows("csv") },
        { key: "export-xls", label: "Exporter XLS", icon: FaFileExcel,
          run: (_rows, ctx) => ctx.exportRows("xls") },
        { key: "export-ods", label: "Exporter ODS", icon: FaFileLines,
          run: (_rows, ctx) => ctx.exportRows("ods") },
    ],

    // Templates are created from an existing invoice, never from a blank form.
    headerActions: [],
};
