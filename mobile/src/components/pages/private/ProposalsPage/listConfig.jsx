import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop DataTable.
// Cf DATATABLE_SPEC.md §13 (v2) -- the server catalog is the source of truth
// for the column list. Local overrides only carry width hints, force a
// column to be visible by default, or attach formatters not implied by the
// type.

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

export const proposalsListConfig = {
    storageKey: "dolipocket.list.proposals",
    rowKey: (row) => row.id,
    defaultSort: { col: "datep", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un devis...",
    },

    columnsOverrides: {
        ref:       { defaultVisible: true,  defaultWidth: 160 },
        refClient: { defaultVisible: false, defaultWidth: 140 },
        socid:     { defaultVisible: true,  defaultWidth: 200, formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
        datep:     { defaultVisible: true,  defaultWidth: 110, formatter: fmtDate },
        finValidite: { defaultVisible: false, defaultWidth: 110, formatter: fmtDate },
        totalHt:   { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        totalTtc:  { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        statut:    {
            defaultVisible: true, defaultWidth: 110,
            formatter: (v) => <StatusPill feature="proposal" status={v} />,
            exportFormatter: (v) => getStatusInfo("proposal", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/proposals/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "proposal.write",
            onClick: (row, ctx) => ctx.navigate(`/proposals/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "proposal.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce devis ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`proposal/${row.id}`).json();
                    ctx.toast.success("Devis supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete proposal", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "proposal.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} devis ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("proposal", { json: { ids: rows.map((r) => r.id) } })
                        .json();
                    const successCount = (res?.success ?? []).length;
                    const errorCount = (res?.errors ?? []).length;
                    if (errorCount > 0) {
                        ctx.toast.error(`${successCount} supprimé${successCount > 1 ? "s" : ""}, ${errorCount} en erreur`);
                    } else {
                        ctx.toast.success(`${successCount} supprimé${successCount > 1 ? "s" : ""}`);
                    }
                    ctx.refresh();
                } catch (err) {
                    console.error("bulk delete proposals", err);
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
            key: "new", label: "Nouveau devis", icon: FaPlus, primary: true, permission: "proposal.create",
            onClick: (ctx) => ctx.navigate("/proposals/new"),
        },
    ],
};
