import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

import { StatusPill, getStatusInfo } from "src/lib/components/StatusPill";

// listConfig for the desktop projects DataTable. Project::$fields drives the
// catalog; the overrides below force the useful columns visible and attach
// formatters. Epure desktop UI conventions apply (no shadow, tight density).

const fmtDate = (ts) => {
    if (!ts) return "";
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};

const fmtAmount = (v) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n === 0) return "";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const projectsListConfig = {
    storageKey: "dolipocket.list.projects",
    rowKey: (row) => row.id,
    defaultSort: { col: "dateStart", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un projet...",
    },

    columnsOverrides: {
        ref:          { defaultVisible: true,  defaultWidth: 150 },
        title:        { defaultVisible: true,  defaultWidth: 240 },
        socid:        { defaultVisible: true,  defaultWidth: 180, formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
        dateStart:    { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        dateEnd:      { defaultVisible: true,  defaultWidth: 120, formatter: fmtDate },
        budgetAmount: { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        public:       {
            defaultVisible: false, defaultWidth: 90,
            formatter: (v) => (Number(v) ? "Public" : "Privé"),
        },
        statut:       {
            defaultVisible: true, defaultWidth: 120,
            formatter: (v) => <StatusPill feature="project" status={v} />,
            exportFormatter: (v) => getStatusInfo("project", v).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/projects/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "project.write",
            onClick: (row, ctx) => ctx.navigate(`/projects/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "project.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce projet ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`project/${row.id}`).json();
                    ctx.toast.success("Projet supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete project", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "project.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} projet${selected.length > 1 ? "s" : ""} ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("project", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete projects", err);
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
            key: "new", label: "Nouveau projet", icon: FaPlus, primary: true, permission: "project.create",
            onClick: (ctx) => ctx.navigate("/projects/new"),
        },
    ],
};
