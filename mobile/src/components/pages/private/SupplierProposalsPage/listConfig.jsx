import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop supplier price requests DataTable.
// SupplierProposal::$fields drives the catalog; the overrides below force the
// useful columns visible and attach formatters.

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

export const supplierProposalsListConfig = {
    storageKey: "dolipocket.list.supplierproposals",
    rowKey: (row) => row.id,
    defaultSort: { col: "dateCreation", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher une demande de prix...",
    },

    columnsOverrides: {
        ref:          { defaultVisible: true,  defaultWidth: 160 },
        socid:        { defaultVisible: true,  defaultWidth: 180, formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
        dateCreation: { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        totalHt:      { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        totalTtc:     { defaultVisible: false, defaultWidth: 130, formatter: fmtAmount },
        statut:       {
            defaultVisible: true, defaultWidth: 120,
            formatter: (v) => <StatusPill feature="supplierproposal" status={v} />,
            exportFormatter: (v) => getStatusInfo("supplierproposal", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/supplier-proposals/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "supplierproposal.write",
            onClick: (row, ctx) => ctx.navigate(`/supplier-proposals/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "supplierproposal.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cette demande de prix ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`supplierproposal/${row.id}`).json();
                    ctx.toast.success("Demande de prix supprimée");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete supplier proposal", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "supplierproposal.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} demande${selected.length > 1 ? "s" : ""} de prix ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("supplierproposal", { json: { ids: rows.map((r) => r.id) } })
                        .json();
                    const successCount = (res?.success ?? []).length;
                    const errorCount = (res?.errors ?? []).length;
                    if (errorCount > 0) {
                        ctx.toast.error(`${successCount} supprimée${successCount > 1 ? "s" : ""}, ${errorCount} en erreur`);
                    } else {
                        ctx.toast.success(`${successCount} supprimée${successCount > 1 ? "s" : ""}`);
                    }
                    ctx.refresh();
                } catch (err) {
                    console.error("bulk delete supplier proposals", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
        { key: "export-csv", label: "Exporter CSV", icon: FaFileCsv,
          run: (_rows, ctx) => ctx.exportRows("csv") },
        { key: "export-xls", label: "Exporter XLS", icon: FaFileExcel,
          run: (_rows, ctx) => ctx.exportRows("xls") },
        { key: "export-ods", label: "Exporter ODS", icon: FaFileLines,
          run: (_rows, ctx) => ctx.exportRows("ods") },
    ],

    headerActions: [
        {
            key: "new", label: "Nouvelle demande de prix", icon: FaPlus, primary: true, permission: "supplierproposal.create",
            onClick: (ctx) => ctx.navigate("/supplier-proposals/new"),
        },
    ],
};
