import {
    FaEye, FaPen, FaTrash, FaPlus,
    FaFileCsv, FaFileExcel, FaFileLines,
} from "react-icons/fa6";

// listConfig for the desktop DataTable.
// Cf DATATABLE_SPEC.md §13 (v2) -- the server catalog is the source of truth
// for the column list. Local overrides only carry width hints, force a
// column to be visible by default, or attach formatters not implied by the
// type.

const fmtAmount = (v) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const productsListConfig = {
    storageKey: "dolipocket.list.products",
    rowKey: (row) => row.id,
    defaultSort: { col: "ref", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un produit...",
    },

    // Surcharges optionnelles : largeur custom, formatter, defaultVisible.
    // Toute autre colonne du catalogue serveur garde ses defaults.
    columnsOverrides: {
        ref:       { defaultVisible: true,  defaultWidth: 160 },
        label:     { defaultVisible: true,  defaultWidth: 280 },
        priceTtc:  { defaultVisible: true,  defaultWidth: 120, formatter: fmtAmount },
        stockReel: { defaultVisible: true,  defaultWidth: 100 },
        price:     { defaultVisible: false, defaultWidth: 120, formatter: fmtAmount },
        barcode:   { defaultVisible: false, defaultWidth: 140 },
        type:      { defaultVisible: false, defaultWidth: 90 },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/products/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "product.write",
            onClick: (row, ctx) => ctx.navigate(`/products/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "product.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce produit ?",
                message: row?.ref ? `${row.ref}${row.label ? ` - ${row.label}` : ""}` : undefined,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`product/${row.id}`).json();
                    ctx.toast.success("Produit supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete product", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "product.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} produit${selected.length > 1 ? "s" : ""} ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("product", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete products", err);
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
            key: "new", label: "Nouveau produit", icon: FaPlus, primary: true, permission: "product.create",
            onClick: (ctx) => ctx.navigate("/products/new"),
        },
    ],
};
