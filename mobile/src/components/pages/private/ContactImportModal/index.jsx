import { useRef } from "react";
import { FaTimes, FaFileUpload, FaAddressBook, FaCheck, FaExclamationTriangle } from "react-icons/fa";

import { useStates } from "@cap-rel/smartcommon";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { hasContactPicker, pickContacts, readFileAsBase64, isVCardFile } from "../../../../utils/functions/vcard";

export const ContactImportModal = ({ onClose, onImportComplete, defaultSocId }) => {
    const dbContacts = useDbContacts();
    const fileInputRef = useRef(null);

    const { states, set } = useStates({
        tab: "file",
        step: "select",
        loading: false,
        error: null,
        preview: [],
        importResult: null,
    });

    const { tab, step, loading, error, preview, importResult } = states ?? {};

    if (!states) {
        return null;
    }

    // --- File import ---
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!isVCardFile(file)) {
            set("error", "Ce fichier n'est pas un fichier vCard (.vcf)");
            return;
        }

        set("loading", true);
        set("error", null);

        try {
            const base64 = await readFileAsBase64(file);
            const data = await dbContacts.importVcardPayload({ content: base64, mode: "preview" });

            if (!data?.contacts || data.contacts.length === 0) {
                set("error", "Aucun contact valide trouvé dans le fichier");
                set("loading", false);
                return;
            }

            set("preview", data.contacts);
            set("step", "preview");
        } catch (err) {
            console.error("dbContacts.importVcardPayload (preview) error", err);
            set("error", "Erreur de lecture du fichier vCard");
        } finally {
            set("loading", false);
        }
    };

    // --- Contact Picker import ---
    const handlePickContacts = async () => {
        set("loading", true);
        set("error", null);

        try {
            const contacts = await pickContacts(["name", "email", "tel", "address"], true);

            if (!contacts || contacts.length === 0) {
                set("loading", false);
                return;
            }

            set("preview", contacts);
            set("step", "preview");
        } catch (err) {
            console.error("Contact Picker error", err);
            if (err.message === "Contact picker already open") {
                set("error", "Le sélecteur de contacts est déjà ouvert");
            } else {
                set("error", "Impossible d'accéder aux contacts du téléphone");
            }
        } finally {
            set("loading", false);
        }
    };

    // --- Confirm import ---
    const handleConfirmImport = async () => {
        if (!preview || preview.length === 0) return;

        set("loading", true);
        set("error", null);

        try {
            // Build vCard content from preview data for file imports,
            // or create contacts directly for picker imports
            let result;

            if (tab === "file") {
                // Re-send with mode=import using the original base64
                const base64 = await readFileAsBase64(fileInputRef.current?.files?.[0]);
                const payload = { content: base64, mode: "import" };
                if (defaultSocId) {
                    payload.fk_soc = defaultSocId;
                }
                result = await dbContacts.importVcardPayload(payload);
            } else {
                // For picker contacts, we create them one by one via the standard hook.
                // The hook expects camelCase fields (mapToBackend converts to snake_case).
                const created = [];
                const errors = [];

                for (let i = 0; i < preview.length; i++) {
                    const c = preview[i];
                    const local = {
                        lastname: c.lastname || "",
                        firstname: c.firstname || "",
                        email: c.email || "",
                        phonePro: c.phone_pro || c.phonePro || "",
                        phoneMobile: c.phone_mobile || c.phoneMobile || "",
                        address: c.address || "",
                        zip: c.zip || "",
                        town: c.town || "",
                        countryCode: c.country_code || c.countryCode || "",
                    };
                    if (defaultSocId) {
                        local.fkSoc = defaultSocId;
                    }

                    try {
                        const res = await dbContacts.create(local);
                        created.push(res);
                    } catch (err) {
                        errors.push({
                            index: i,
                            name: `${c.firstname} ${c.lastname}`.trim(),
                            error: err.message || "Erreur",
                        });
                    }
                }

                result = {
                    created,
                    created_count: created.length,
                    errors,
                    error_count: errors.length,
                };
            }

            set("importResult", result);
            set("step", "result");
        } catch (err) {
            console.error("Import error", err);
            set("error", "Erreur lors de l'import des contacts");
        } finally {
            set("loading", false);
        }
    };

    const formatContactName = (c) => {
        return [c.firstname, c.lastname].filter(Boolean).join(" ").trim() || "(sans nom)";
    };

    const showPicker = hasContactPicker();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-800">Importer des contacts</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <FaTimes />
                    </button>
                </div>

                {/* Tabs (only if picker available) */}
                {showPicker && step === "select" && (
                    <div className="flex border-b border-gray-100">
                        <button
                            type="button"
                            onClick={() => { set("tab", "file"); set("error", null); }}
                            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 ${
                                tab === "file"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-gray-500"
                            }`}
                        >
                            Depuis un fichier
                        </button>
                        <button
                            type="button"
                            onClick={() => { set("tab", "picker"); set("error", null); }}
                            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 ${
                                tab === "picker"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-gray-500"
                            }`}
                        >
                            Depuis le téléphone
                        </button>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4">
                    {error && (
                        <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4 flex items-start gap-2">
                            <FaExclamationTriangle className="flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Step: Select source */}
                    {step === "select" && (
                        <>
                            {tab === "file" && (
                                <div className="text-center py-8">
                                    <FaFileUpload className="mx-auto text-5xl text-gray-300 mb-4" />
                                    <p className="text-gray-600 mb-4">
                                        Sélectionnez un fichier vCard (.vcf)
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".vcf,.vcard,text/vcard,text/x-vcard"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={loading}
                                        className="px-6 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                                    >
                                        {loading ? "Lecture..." : "Choisir un fichier"}
                                    </button>
                                </div>
                            )}

                            {tab === "picker" && (
                                <div className="text-center py-8">
                                    <FaAddressBook className="mx-auto text-5xl text-gray-300 mb-4" />
                                    <p className="text-gray-600 mb-4">
                                        Sélectionnez des contacts depuis le carnet d&apos;adresses de votre téléphone
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handlePickContacts}
                                        disabled={loading}
                                        className="px-6 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                                    >
                                        {loading ? "Chargement..." : "Ouvrir mes contacts"}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Step: Preview */}
                    {step === "preview" && preview && (
                        <>
                            <p className="text-sm text-gray-600 mb-3">
                                {preview.length} contact{preview.length > 1 ? "s" : ""} détecté{preview.length > 1 ? "s" : ""}
                            </p>
                            <ul className="space-y-2 mb-4">
                                {preview.map((c, i) => (
                                    <li
                                        key={i}
                                        className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                                    >
                                        <div className="font-medium text-gray-800">
                                            {formatContactName(c)}
                                        </div>
                                        {c.email && (
                                            <div className="text-xs text-gray-500">{c.email}</div>
                                        )}
                                        {(c.phone_mobile || c.phone_pro || c.phoneMobile || c.phonePro) && (
                                            <div className="text-xs text-gray-500">
                                                {c.phone_mobile || c.phoneMobile || c.phone_pro || c.phonePro}
                                            </div>
                                        )}
                                        {c.org && (
                                            <div className="text-xs text-gray-400">{c.org}</div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Step: Result */}
                    {step === "result" && importResult && (
                        <div className="py-4">
                            {importResult.created_count > 0 && (
                                <div className="p-3 bg-green-100 text-green-700 rounded-lg mb-3 flex items-center gap-2">
                                    <FaCheck />
                                    <span>
                                        {importResult.created_count} contact{importResult.created_count > 1 ? "s" : ""} importé{importResult.created_count > 1 ? "s" : ""}
                                    </span>
                                </div>
                            )}
                            {importResult.error_count > 0 && (
                                <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FaExclamationTriangle />
                                        <span>
                                            {importResult.error_count} erreur{importResult.error_count > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <ul className="text-sm space-y-1">
                                        {importResult.errors?.map((e, i) => (
                                            <li key={i}>
                                                {e.name} : {e.error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 flex gap-3">
                    {step === "select" && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium"
                        >
                            Annuler
                        </button>
                    )}

                    {step === "preview" && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    set("step", "select");
                                    set("preview", []);
                                    set("error", null);
                                }}
                                disabled={loading}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium disabled:opacity-50"
                            >
                                Retour
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={loading || !preview?.length}
                                className="flex-1 py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50"
                            >
                                {loading
                                    ? "Import..."
                                    : `Importer ${preview?.length || 0} contact${(preview?.length || 0) > 1 ? "s" : ""}`}
                            </button>
                        </>
                    )}

                    {step === "result" && (
                        <button
                            type="button"
                            onClick={onImportComplete}
                            className="flex-1 py-3 bg-primary text-white rounded-xl font-medium"
                        >
                            Terminer
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
