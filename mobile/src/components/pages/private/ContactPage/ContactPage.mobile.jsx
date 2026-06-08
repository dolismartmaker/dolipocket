import { FaArrowLeft, FaPen, FaTrash, FaUser, FaMapMarkerAlt, FaPhone, FaEnvelope, FaBriefcase, FaStickyNote, FaChevronDown, FaChevronUp, FaShare, FaDownload } from "react-icons/fa";

import { Page } from "@cap-rel/smartcommon";

import { canShare } from "../../../../utils/functions/vcard";

// Mobile rendering of the contact detail page. Extracted verbatim from the
// previous monolithic index.jsx -- visually unchanged on mobile. Data
// and handlers come from useContactData via props.

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

export const ContactPageMobile = (props) => {
    const {
        item, loading, error, openSections, fullName,
        loadContact, handleBack, handleEdit, handleDelete, toggleSection, handleExportVCard,
    } = props;

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">
                            {loading ? "Chargement..." : (fullName || "Contact")}
                        </h1>
                        {item?.poste && (
                            <p className="text-sm text-white/80 truncate">{item.poste}</p>
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
                </div>
            </div>

            <div className="p-4 pb-32 space-y-3">
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
                    <div className="space-y-3">
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
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex gap-3 z-10">
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
