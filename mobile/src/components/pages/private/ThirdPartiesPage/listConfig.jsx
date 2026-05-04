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

const fmtBool = (v) => {
    if (v === null || v === undefined || v === "") return "";
    return Number(v) === 1 || v === true ? "Oui" : "Non";
};

export const thirdPartiesListConfig = {
    storageKey: "dolipocket.list.thirdparties",
    rowKey: (row) => row.id,
    defaultSort: { col: "name", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un tiers...",
    },

    // Surcharges optionnelles : largeur custom, formatter, defaultVisible.
    // Toute autre colonne du catalogue serveur garde ses defaults.
    columnsOverrides: {
        name:        { defaultVisible: true,  defaultWidth: 220 },
        codeClient:  { defaultVisible: true,  defaultWidth: 140 },
        email:       { defaultVisible: true,  defaultWidth: 220 },
        town:        { defaultVisible: true,  defaultWidth: 140 },
        countryCode: { defaultVisible: false, defaultWidth: 80 },
        client:      { defaultVisible: true,  defaultWidth: 80,  formatter: fmtBool },
        fournisseur: { defaultVisible: false, defaultWidth: 110, formatter: fmtBool },
        siren:       { defaultVisible: false, defaultWidth: 130 },
        createdAt:   {
            defaultVisible: false,
            defaultWidth: 120,
            formatter: (v) => fmtDate(v),
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/thirdparties/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "thirdparty.write",
            onClick: (row, ctx) => ctx.navigate(`/thirdparties/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "thirdparty.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce tiers ?",
                message: row?.name,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`thirdparty/${row.id}`).json();
                    ctx.toast.success("Tiers supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete thirdparty", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "thirdparty.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} tiers ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("thirdparty", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete thirdparties", err);
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
            key: "new", label: "Nouveau tiers", icon: FaPlus, primary: true, permission: "thirdparty.create",
            onClick: (ctx) => ctx.navigate("/thirdparties/new"),
        },
    ],
};
