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

export const contactsListConfig = {
    storageKey: "dolipocket.list.contacts",
    rowKey: (row) => row.id,
    defaultSort: { col: "lastname", order: "asc" },
    defaultPageSize: 50,
    pageSizeOptions: [25, 50, 100],
    clientThreshold: 5000,

    globalSearch: {
        placeholder: "Rechercher un contact...",
    },

    // Surcharges optionnelles : largeur custom, formatter, defaultVisible.
    // Toute autre colonne du catalogue serveur garde ses defaults.
    columnsOverrides: {
        lastname:    { defaultVisible: true,  defaultWidth: 180 },
        firstname:   { defaultVisible: true,  defaultWidth: 160 },
        email:       { defaultVisible: true,  defaultWidth: 240 },
        fkSoc: {
            defaultVisible: true,
            defaultWidth: 120,
            formatter: (socId, row) => {
                const name = row?.fkSocName || "";
                return name ? `${name} (#${socId})` : socId ? `#${socId}` : "—";
            },
        },
        phonePro:    { defaultVisible: false, defaultWidth: 140 },
        town:        { defaultVisible: false, defaultWidth: 140 },
        countryCode: { defaultVisible: false, defaultWidth: 80 },
        createdAt:   {
            defaultVisible: false,
            defaultWidth: 120,
            formatter: (v) => fmtDate(v),
        },
    },

    rowActions: [
        {
            key: "view", icon: FaEye, label: "Voir",
            onClick: (row, ctx) => ctx.navigate(`/contacts/${row.id}`),
        },
        {
            key: "edit", icon: FaPen, label: "Modifier", permission: "contact.write",
            onClick: (row, ctx) => ctx.navigate(`/contacts/${row.id}/edit`),
        },
    ],

    rowKebabActions: [
        {
            key: "delete", label: "Supprimer", danger: true, permission: "contact.delete",
            confirm: ({ row }) => ({
                type: "delete",
                title: "Supprimer ce contact ?",
                message: row?.lastname ? `${row.firstname ?? ""} ${row.lastname}`.trim() : undefined,
                danger: true,
            }),
            onClick: async (row, ctx) => {
                try {
                    await ctx.api.delete(`contact/${row.id}`).json();
                    ctx.toast.success("Contact supprimé");
                    ctx.refresh();
                } catch (err) {
                    console.error("delete contact", err);
                    ctx.toast.error("Suppression impossible");
                }
            },
        },
    ],

    bulkActions: [
        {
            key: "delete", label: "Supprimer", icon: FaTrash, danger: true, permission: "contact.delete",
            confirm: ({ selected }) => ({
                type: "delete",
                title: `Supprimer ${selected.length} contact${selected.length > 1 ? "s" : ""} ?`,
                danger: true,
            }),
            run: async (rows, ctx) => {
                try {
                    const res = await ctx.api
                        .delete("contact", { json: { ids: rows.map((r) => r.id) } })
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
                    console.error("bulk delete contacts", err);
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
            key: "new", label: "Nouveau contact", icon: FaPlus, primary: true, permission: "contact.create",
            onClick: (ctx) => ctx.navigate("/contacts/new"),
        },
    ],
};
