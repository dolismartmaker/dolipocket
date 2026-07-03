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

// Paye flag rendering: an emerald "Payée" pill when the invoice is fully
// settled, an amber "Impayée" pill otherwise. Goes through <StatusPill>
// label override so the visual style stays consistent with the other
// status pills.
const renderPayePill = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const paid = Number(v) === 1;
    return paid
        ? <StatusPill label="Payée" tone="emerald" />
        : <StatusPill label="Impayée" tone="amber" />;
};

const exportPayeText = (v) => {
    if (v === null || v === undefined || v === "") return "";
    return Number(v) === 1 ? "Payée" : "Impayée";
};

export const invoicesListConfig = {
    storageKey: "dolipocket.list.invoices",
    rowKey: (row) => row.id,
    defaultSort: { col: "datef", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher une facture...",
    },

    columnsOverrides: {
        ref:              { defaultVisible: true,  defaultWidth: 160 },
        refClient:        { defaultVisible: false, defaultWidth: 140 },
        socid:            { defaultVisible: true,  defaultWidth: 200, formatter: (v, row) => row?.socname || (v ? `#${v}` : "-") },
        datef:            { defaultVisible: true,  defaultWidth: 110, formatter: fmtDate },
        dateLimReglement: { defaultVisible: false, defaultWidth: 110, formatter: fmtDate },
        totalHt:          { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        totalTtc:         { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        paye:             {
            defaultVisible: true, defaultWidth: 100,
            formatter: renderPayePill,
            exportFormatter: exportPayeText,
        },
        statut:           {
            defaultVisible: true, defaultWidth: 110,
            formatter: (v, row) => <StatusPill feature="invoice" status={v} paid={Number(row?.paye) === 1} />,
            exportFormatter: (v, row) => getStatusInfo("invoice", v, { paid: Number(row?.paye) === 1 }).label,
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/invoices/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "invoice.write",
            onClick: (row, ctx) => ctx.navigate(`/invoices/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "invoice.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cette facture ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`invoice/${row.id}`).json();
                    ctx.toast.success("Facture supprimée");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete invoice", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "invoice.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} facture${selected.length > 1 ? "s" : ""} ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("invoice", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete invoices", err);
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
            key: "new", label: "Nouvelle facture", icon: FaPlus, primary: true, permission: "invoice.create",
            onClick: (ctx) => ctx.navigate("/invoices/new"),
        },
    ],
};
