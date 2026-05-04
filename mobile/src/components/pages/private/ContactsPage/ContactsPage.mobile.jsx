import { FaArrowLeft, FaPlus, FaSearch, FaUser, FaUpload, FaDownload, FaCheck, FaTimes } from "react-icons/fa";

import { Page } from "@cap-rel/smartcommon";

import { ContactImportModal } from "../ContactImportModal";

// Mobile rendering of the contacts list. Presentational only (no fetch,
// no useDb*, no useApi). All data and handlers come from useContactsData()
// via props.

export const ContactsPageMobile = (props) => {
    const {
        navigate,
        dbContacts,
        socidFilter,
        items, loading, error, q, page,
        selectionMode, selectedIds, exporting, showImportModal,
        set, loadContacts,
        utils,
    } = props;

    const handleBack = () => navigate("/");
    const handleCreate = () => {
        if (socidFilter) {
            navigate(`/contacts/new?socid=${socidFilter}`);
        } else {
            navigate("/contacts/new");
        }
    };
    const handleOpen = (id) => {
        if (selectionMode) {
            toggleSelection(id);
        } else {
            navigate(`/contacts/${id}`);
        }
    };

    const formatName = (c) => {
        const parts = [];
        if (c.civility) parts.push(c.civility);
        if (c.firstname) parts.push(c.firstname);
        if (c.lastname) parts.push(c.lastname);
        return parts.join(" ").trim() || "(sans nom)";
    };

    const toggleSelectionMode = () => {
        if (selectionMode) {
            set("selectionMode", false);
            set("selectedIds", []);
        } else {
            set("selectionMode", true);
        }
    };

    const toggleSelection = (id) => {
        const current = selectedIds || [];
        if (current.includes(id)) {
            set("selectedIds", current.filter((i) => i !== id));
        } else {
            set("selectedIds", [...current, id]);
        }
    };

    const selectAll = () => {
        if (!items) return;
        set("selectedIds", items.map((c) => c.id));
    };

    const handleExportSelected = async () => {
        if (!selectedIds || selectedIds.length === 0) return;
        set("exporting", true);
        try {
            const data = await dbContacts.exportVcard(selectedIds);
            if (!data?.content) {
                set("error", "Export vCard impossible");
                return;
            }
            const blob = utils.base64ToBlob(data.content, data["content-type"] || "text/vcard");
            const filename = data.filename || "contacts_export.vcf";
            utils.triggerDownload(blob, filename);
            set("selectionMode", false);
            set("selectedIds", []);
        } catch (err) {
            console.error("dbContacts.exportVcard error", err);
            set("error", "Export vCard impossible");
        } finally {
            set("exporting", false);
        }
    };

    const handleImportComplete = () => {
        set("showImportModal", false);
        loadContacts(1);
    };

    const selectedCount = selectedIds?.length || 0;

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Contacts</h1>
                        {socidFilter && (
                            <p className="text-xs text-white/80">Filtre par tiers #{socidFilter}</p>
                        )}
                    </div>
                    <button
                        onClick={handleCreate}
                        className="p-2 bg-white/20 rounded-full"
                        aria-label="Créer un contact"
                    >
                        <FaPlus />
                    </button>
                    <button
                        onClick={() => set("showImportModal", true)}
                        className="p-2"
                        aria-label="Importer des contacts"
                        title="Importer vCard"
                    >
                        <FaUpload />
                    </button>
                    <button
                        onClick={toggleSelectionMode}
                        className={`p-2 ${selectionMode ? "bg-white/20 rounded-lg" : ""}`}
                        aria-label={selectionMode ? "Annuler la sélection" : "Sélectionner"}
                        title={selectionMode ? "Annuler" : "Sélection multiple"}
                    >
                        {selectionMode ? <FaTimes /> : <FaCheck />}
                    </button>
                </div>

                <div className="mt-3 relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="search"
                        value={q}
                        onChange={(e) => set("q", e.target.value)}
                        placeholder="Rechercher un contact..."
                        className="w-full pl-10 pr-3 py-2 rounded-lg text-gray-800 bg-white focus:outline-none"
                    />
                </div>
            </div>

            <div className={`p-4 ${selectionMode ? "pb-32" : "pb-app-base"}`}>
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">
                        {error}
                        <button onClick={() => loadContacts(1)} className="ml-2 underline">
                            Réessayer
                        </button>
                    </div>
                )}

                {loading && items?.length === 0 && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {!loading && items?.length === 0 && !error && (
                    <div className="text-center text-gray-500 py-12">
                        <FaUser className="mx-auto text-4xl mb-3 text-gray-300" />
                        <div>Aucun contact</div>
                    </div>
                )}

                <ul className="flex flex-col gap-2">
                    {items?.map((c) => {
                        const isSelected = selectedIds?.includes(c.id);
                        return (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => handleOpen(c.id)}
                                    className={`w-full text-left bg-white p-3 rounded-xl shadow-sm border active:bg-gray-50 ${
                                        isSelected ? "border-primary bg-primary/5" : "border-gray-100"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {selectionMode && (
                                            <div
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                                                    isSelected
                                                        ? "bg-primary border-primary text-white"
                                                        : "border-gray-300"
                                                }`}
                                            >
                                                {isSelected && <FaCheck className="text-xs" />}
                                            </div>
                                        )}
                                        {!selectionMode && (
                                            <div className="bg-primary/10 text-primary p-2 rounded-lg">
                                                <FaUser />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-800 truncate">
                                                {formatName(c)}
                                            </div>
                                            {c.poste && (
                                                <div className="text-sm text-gray-500 truncate">{c.poste}</div>
                                            )}
                                            {(c.email || c.phoneMobile || c.phonePro) && (
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    {c.email}
                                                    {c.email && (c.phoneMobile || c.phonePro) && " - "}
                                                    {c.phoneMobile || c.phonePro}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {items?.length >= 50 && (
                    <div className="flex justify-center gap-2 mt-4">
                        <button
                            type="button"
                            onClick={() => loadContacts(Math.max(1, page - 1))}
                            disabled={page <= 1 || loading}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Précédent
                        </button>
                        <button
                            type="button"
                            onClick={() => loadContacts(page + 1)}
                            disabled={loading}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
                        >
                            Suivant
                        </button>
                    </div>
                )}
            </div>

            {selectionMode && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-20">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={selectAll}
                            className="px-3 py-2 text-sm text-primary font-medium"
                        >
                            Tout sélectionner
                        </button>
                        <div className="flex-1 text-center text-sm text-gray-600">
                            {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
                        </div>
                        <button
                            type="button"
                            onClick={handleExportSelected}
                            disabled={selectedCount === 0 || exporting}
                            className="px-4 py-2 bg-primary text-white rounded-lg flex items-center gap-2 font-medium disabled:opacity-50"
                        >
                            <FaDownload />
                            {exporting ? "Export..." : "Exporter"}
                        </button>
                    </div>
                </div>
            )}

            {showImportModal && (
                <ContactImportModal
                    onClose={() => set("showImportModal", false)}
                    onImportComplete={handleImportComplete}
                    defaultSocId={socidFilter}
                />
            )}
        </Page>
    );
};
