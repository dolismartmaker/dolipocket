import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaUser, FaMapMarkerAlt, FaPhone, FaEnvelope, FaBriefcase, FaStickyNote, FaChevronDown, FaChevronUp, FaShare, FaDownload } from "react-icons/fa";

import { Page, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { base64ToBlob, triggerDownload, canShare, shareVCard } from "../../../../utils/functions/vcard";

const Section = ({ title, icon: Icon, open, onToggle, children }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between p-3 active:bg-gray-50"
        >
            <div className="flex items-center gap-3">
                {Icon && (
                    <div className="bg-primary/10 text-primary p-2 rounded-lg">
                        <Icon />
                    </div>
                )}
                <span className="font-semibold text-gray-800">{title}</span>
            </div>
            {open ? <FaChevronUp className="text-gray-400" /> : <FaChevronDown className="text-gray-400" />}
        </button>
        {open && <div className="px-4 pb-4 pt-1 space-y-2">{children}</div>}
    </div>
);

const Field = ({ label, value }) => {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-400 uppercase">{label}</span>
            <span className="text-gray-700 break-words whitespace-pre-wrap">{String(value)}</span>
        </div>
    );
};

export const ContactPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbContacts = useDbContacts();
    const { confirm } = useConfirm();

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        openSections: { identite: true, adresse: false, contact: false, poste: false, notes: false },
    });

    const { item, loading, error, openSections } = states ?? {};

    const hasClient = !!dbContacts.get;

    useEffect(() => {
        if (!hasClient || !id) return;
        loadContact();
    }, [hasClient, id]);

    const loadContact = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbContacts.get(id);
            set("item", data);
        } catch (err) {
            console.error("dbContacts.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Contact introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/contacts");
    const handleEdit = () => navigate(`/contacts/${id}/edit`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce contact ?",
            message: "Cette action est irréversible.",
        });
        if (!ok) return;

        try {
            await dbContacts.remove(id);
            navigate("/contacts");
        } catch (err) {
            console.error("dbContacts.remove error", err);
            set("error", "Suppression impossible");
        }
    };

    const toggleSection = (key) => {
        set(`openSections.${key}`, !openSections?.[key]);
    };

    const handleExportVCard = async () => {
        if (!item?.id) return;

        try {
            const data = await dbContacts.exportVcard(item.id);
            if (!data?.content) {
                set("error", "Export vCard impossible");
                return;
            }

            const blob = base64ToBlob(data.content, data["content-type"] || "text/vcard");
            const filename = data.filename || "contact.vcf";

            // Try Web Share API first (for mobile)
            if (canShare()) {
                const shared = await shareVCard(blob, filename, fullName || "Contact");
                if (shared) return;
            }

            // Fallback to download
            triggerDownload(blob, filename);
        } catch (err) {
            console.error("dbContacts.exportVcard error", err);
            set("error", "Export vCard impossible");
        }
    };

    const fullName = item ? [item.civility, item.firstname, item.lastname].filter(Boolean).join(" ").trim() : "";

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">
                            {loading ? "Chargement..." : (fullName || "Contact")}
                        </h1>
                        {item?.poste && (
                            <p className="text-sm text-white/80 md:text-gray-500 truncate">{item.poste}</p>
                        )}
                    </div>
                    {item && (
                        <button
                            onClick={handleExportVCard}
                            className="p-2"
                            aria-label="Partager le contact"
                            title="Exporter vCard"
                        >
                            {canShare() ? <FaShare /> : <FaDownload />}
                        </button>
                    )}
                    {/* Desktop actions in header */}
                    {item && (
                        <div className="hidden md:flex md:items-center md:gap-2">
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-100 text-red-600 rounded-lg flex items-center gap-2 font-medium text-sm"
                            >
                                <FaTrash /> Supprimer
                            </button>
                            <button
                                type="button"
                                onClick={handleEdit}
                                className="px-4 py-2 bg-primary text-white rounded-lg flex items-center gap-2 font-medium text-sm"
                            >
                                <FaPen /> Éditer
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 pb-32 md:pb-6 md:px-6 space-y-3 md:max-w-5xl md:mx-auto">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                        {error}
                        <button onClick={loadContact} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {loading && !item && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {item && (
                    <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        <Section
                            title="Identité"
                            icon={FaUser}
                            open={!!openSections?.identite}
                            onToggle={() => toggleSection("identite")}
                        >
                            <Field label="Civilité" value={item.civility} />
                            <Field label="Prénom" value={item.firstname} />
                            <Field label="Nom" value={item.lastname} />
                            <Field label="Tiers (ID)" value={item.fkSoc} />
                        </Section>

                        <Section
                            title="Adresse"
                            icon={FaMapMarkerAlt}
                            open={!!openSections?.adresse}
                            onToggle={() => toggleSection("adresse")}
                        >
                            <Field label="Adresse" value={item.address} />
                            <Field label="Code postal" value={item.zip} />
                            <Field label="Ville" value={item.town} />
                            <Field label="Pays" value={item.countryCode} />
                        </Section>

                        <Section
                            title="Contact"
                            icon={FaPhone}
                            open={!!openSections?.contact}
                            onToggle={() => toggleSection("contact")}
                        >
                            {item.phonePro && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaPhone className="text-gray-400" />
                                    <a href={`tel:${item.phonePro}`} className="underline">{item.phonePro}</a>
                                    <span className="text-xs text-gray-400">(pro)</span>
                                </div>
                            )}
                            {item.phoneMobile && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaPhone className="text-gray-400" />
                                    <a href={`tel:${item.phoneMobile}`} className="underline">{item.phoneMobile}</a>
                                    <span className="text-xs text-gray-400">(mobile)</span>
                                </div>
                            )}
                            <Field label="Fax" value={item.fax} />
                            {item.email && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaEnvelope className="text-gray-400" />
                                    <a href={`mailto:${item.email}`} className="underline">{item.email}</a>
                                </div>
                            )}
                        </Section>

                        <Section
                            title="Poste"
                            icon={FaBriefcase}
                            open={!!openSections?.poste}
                            onToggle={() => toggleSection("poste")}
                        >
                            <Field label="Fonction" value={item.poste} />
                            <Field label="Statut" value={item.statut} />
                        </Section>

                        <Section
                            title="Notes"
                            icon={FaStickyNote}
                            open={!!openSections?.notes}
                            onToggle={() => toggleSection("notes")}
                        >
                            <Field label="Note publique" value={item.notePublic} />
                            <Field label="Note privée" value={item.notePrivate} />
                        </Section>
                    </div>
                )}
            </div>

            {/* Bottom action bar - mobile only */}
            {item && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex gap-3 z-10 md:hidden">
                    <button
                        type="button"
                        onClick={handleDelete}
                        className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl flex items-center justify-center gap-2 font-medium"
                    >
                        <FaTrash /> Supprimer
                    </button>
                    <button
                        type="button"
                        onClick={handleEdit}
                        className="flex-1 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium"
                    >
                        <FaPen /> Éditer
                    </button>
                </div>
            )}
        </Page>
    );
};
