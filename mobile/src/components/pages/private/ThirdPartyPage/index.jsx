import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaBuilding, FaMapMarkerAlt, FaPhone, FaEnvelope, FaGlobe, FaIdCard, FaStickyNote, FaChevronDown, FaChevronUp } from "react-icons/fa";

import { Page, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbThirdParties } from "src/db/stores/thirdparties/useDbThirdParties";

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

export const ThirdPartyPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbThirdParties = useDbThirdParties();
    const { confirm } = useConfirm();

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        openSections: { identite: true, adresse: false, contact: false, fiscal: false, notes: false },
    });

    const { item, loading, error, openSections } = states ?? {};

    const hasClient = !!dbThirdParties.get;

    useEffect(() => {
        if (!hasClient || !id) return;
        loadThirdParty();
    }, [hasClient, id]);

    const loadThirdParty = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbThirdParties.get(id);
            set("item", data);
        } catch (err) {
            console.error("dbThirdParties.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Tiers introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/thirdparties");
    const handleEdit = () => navigate(`/thirdparties/${id}/edit`);

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer ce tiers ?",
            message: "Cette action est irréversible.",
        });
        if (!ok) return;

        try {
            await dbThirdParties.remove(id);
            navigate("/thirdparties");
        } catch (err) {
            console.error("dbThirdParties.remove error", err);
            set("error", "Suppression impossible");
        }
    };

    const toggleSection = (key) => {
        set(`openSections.${key}`, !openSections?.[key]);
    };

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary md:bg-none md:bg-white md:shadow-sm md:border-b md:border-gray-200 p-4 text-white md:text-gray-800 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">
                            {loading ? "Chargement..." : item?.name || "Tiers"}
                        </h1>
                        {item?.nameAlias && (
                            <p className="text-sm text-white/80 md:text-gray-500 truncate">{item.nameAlias}</p>
                        )}
                    </div>
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
                        <button onClick={loadThirdParty} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {loading && !item && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {item && (
                    <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        <Section
                            title="Identité"
                            icon={FaBuilding}
                            open={!!openSections?.identite}
                            onToggle={() => toggleSection("identite")}
                        >
                            <Field label="Nom" value={item.name} />
                            <Field label="Nom commercial" value={item.nameAlias} />
                            <Field label="Code client" value={item.codeClient} />
                            <Field label="Code fournisseur" value={item.codeFournisseur} />
                            <div className="flex flex-wrap gap-2 mt-2">
                                {!!item.client && item.client > 0 && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Client</span>
                                )}
                                {!!item.fournisseur && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Fournisseur</span>
                                )}
                            </div>
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
                            {item.phone && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaPhone className="text-gray-400" />
                                    <a href={`tel:${item.phone}`} className="underline">{item.phone}</a>
                                </div>
                            )}
                            {item.email && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaEnvelope className="text-gray-400" />
                                    <a href={`mailto:${item.email}`} className="underline">{item.email}</a>
                                </div>
                            )}
                            {item.url && (
                                <div className="flex items-center gap-2 text-gray-700">
                                    <FaGlobe className="text-gray-400" />
                                    <a href={item.url} target="_blank" rel="noreferrer" className="underline">
                                        {item.url}
                                    </a>
                                </div>
                            )}
                        </Section>

                        <Section
                            title="Fiscal"
                            icon={FaIdCard}
                            open={!!openSections?.fiscal}
                            onToggle={() => toggleSection("fiscal")}
                        >
                            <Field label="SIREN" value={item.siren} />
                            <Field label="SIRET" value={item.siret} />
                            <Field label="APE" value={item.ape} />
                            <Field label="Idprof4" value={item.idprof4} />
                            <Field label="TVA intracommunautaire" value={item.tvaIntra} />
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
