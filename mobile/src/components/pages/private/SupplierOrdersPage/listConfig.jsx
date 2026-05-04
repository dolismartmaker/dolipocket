import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

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

export const supplierOrdersListConfig = {
    storageKey: "dolipocket.list.supplierOrders",
    rowKey: (row) => row.id,
    defaultSort: { col: "dateCommande", order: "desc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher une commande fournisseur...",
    },

    columnsOverrides: {
        ref:           { defaultVisible: true,  defaultWidth: 160 },
        refSupplier:   { defaultVisible: false, defaultWidth: 160 },
        socid:         { defaultVisible: true,  defaultWidth: 220 },
        dateCommande:  { defaultVisible: true,  defaultWidth: 110, formatter: fmtDate },
        dateLivraison: { defaultVisible: false, defaultWidth: 110, formatter: fmtDate },
        totalHt:       { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        totalTtc:      { defaultVisible: true,  defaultWidth: 130, formatter: fmtAmount },
        statut:        { defaultVisible: true,  defaultWidth: 140 },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/supplier-orders/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "supplierorder.write",
            onClick: (row, ctx) => ctx.navigate(`/supplier-orders/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "supplierorder.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cette commande fournisseur ?",
                message: row?.ref,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`supplierorder/${row.id}`).json();
                    ctx.toast.success("Commande supprimée");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete supplier order", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "supplierorder.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} commande${selected.length > 1 ? "s" : ""} fournisseur ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("supplierorder", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete supplier orders", err);
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
            key: "new", label: "Nouvelle commande fournisseur", icon: FaPlus, primary: true, permission: "supplierorder.create",
            onClick: (ctx) => ctx.navigate("/supplier-orders/new"),
        },
    ],
};
