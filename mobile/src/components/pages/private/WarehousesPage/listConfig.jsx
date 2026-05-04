import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

// listConfig for the desktop DataTable.
// Cf DATATABLE_SPEC.md §13 (v2) -- the server catalog is the source of truth
// for the column list. Local overrides only carry width hints, force a
// column to be visible by default, or attach formatters not implied by the
// type.

export const warehousesListConfig = {
    storageKey: "dolipocket.list.warehouses",
    rowKey: (row) => row.id,
    defaultSort: { col: "ref", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un entrepôt...",
    },

    columnsOverrides: {
        ref:         { defaultVisible: true,  defaultWidth: 160 },
        label:       { defaultVisible: true,  defaultWidth: 240 },
        lieu:        { defaultVisible: false, defaultWidth: 160 },
        town:        { defaultVisible: true,  defaultWidth: 160 },
        zip:         { defaultVisible: false, defaultWidth: 100 },
        countryCode: { defaultVisible: true,  defaultWidth: 80 },
        phone:       { defaultVisible: false, defaultWidth: 140 },
        statut:      { defaultVisible: false, defaultWidth: 100 },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/warehouses/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "warehouse.write",
            onClick: (row, ctx) => ctx.navigate(`/warehouses/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "warehouse.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer cet entrepôt ?",
                message: row?.ref ? `${row.ref}${row.label ? ` - ${row.label}` : ""}` : undefined,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`warehouse/${row.id}`).json();
                    ctx.toast.success("Entrepôt supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete warehouse", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "warehouse.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} entrepôt${selected.length > 1 ? "s" : ""} ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("warehouse", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete warehouses", err);
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
            key: "new", label: "Nouvel entrepôt", icon: FaPlus, primary: true, permission: "warehouse.create",
            onClick: (ctx) => ctx.navigate("/warehouses/new"),
        },
    ],
};
