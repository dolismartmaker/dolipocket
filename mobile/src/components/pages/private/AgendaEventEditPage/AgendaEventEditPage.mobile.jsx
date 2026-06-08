import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaSave } from "react-icons/fa";

import { Page, useStates } from "@cap-rel/smartcommon";
import { SearchPicker } from "../../../common/SearchPicker";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Convert a unix timestamp (seconds) to "YYYY-MM-DDTHH:mm" suitable for
// <input type="datetime-local">. Returns "" when timestamp is null.
const tsToInput = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

// Convert "YYYY-MM-DDTHH:mm" string from <input type="datetime-local"> to
// a unix timestamp in seconds, in local timezone. Returns null on empty.
const inputToTs = (str) => {
    if (!str) return null;
    const ts = new Date(str).getTime();
    if (Number.isNaN(ts)) return null;
    return Math.floor(ts / 1000);
};

const TYPE_OPTIONS = [
    { value: "AC_OTH", label: "Autre" },
    { value: "AC_OTH_AUTO", label: "Action automatique" },
    { value: "AC_RDV", label: "Rendez-vous" },
    { value: "AC_TEL", label: "Appel téléphonique" },
    { value: "AC_FAX", label: "Fax" },
    { value: "AC_EMAIL", label: "Email" },
];

// Mobile rendering of the agenda event edit page. Historical implementation
// extracted verbatim from the legacy AgendaEventEditPage/index.jsx (touch-
// friendly inputs, SearchPicker for FK lookups). Self-contained: owns its
// own form state and load/save handlers. The desktop variant uses AutoForm
// with its own data hook (useAgendaEventEditData) instead.
export const AgendaEventEditPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();

    const isNew = !id;

    const { states, set } = useStates({
        loading: !isNew,
        saving: false,
        error: null,
        form: {
            label: "",
            typeCode: "AC_OTH",
            datep: "",
            datef: "",
            fulldayevent: false,
            location: "",
            note: "",
            socid: "",
            fkContact: "",
            fkUserAssigned: "",
            percentage: 0,
        },
    });

    const { loading, saving, error, form } = states ?? {};

    // Guard: wait for states to be initialized
    if (!form) {
        return (
            <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-gray-500">Chargement...</div>
                </div>
            </Page>
        );
    }

    const hasClient = !!dbAgenda.list;

    useEffect(() => {
        if (isNew) return;
        if (!hasClient || !id) return;
        loadEvent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id, isNew]);

    const loadEvent = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbAgenda.get(id);
            set("form", {
                label: data?.label ?? "",
                typeCode: data?.typeCode ?? "AC_OTH",
                datep: tsToInput(data?.datep),
                datef: tsToInput(data?.datef),
                fulldayevent: !!data?.fulldayevent,
                location: data?.location ?? "",
                note: data?.note ?? "",
                socid: data?.socid ? String(data.socid) : "",
                fkContact: data?.fkContact ? String(data.fkContact) : "",
                fkUserAssigned: data?.fkUserAssigned ? String(data.fkUserAssigned) : "",
                percentage: data?.percentage ?? 0,
            });
        } catch (err) {
            console.error("dbAgenda.get error", err);
            if (err?.response?.status === 404) {
                set("error", "Évènement introuvable");
            } else {
                set("error", "Erreur de chargement");
            }
        } finally {
            set("loading", false);
        }
    };

    const updateField = (key, value) => {
        set(`form.${key}`, value);
    };

    const buildPayload = () => {
        const payload = {
            label: form.label,
            typeCode: form.typeCode,
            datep: inputToTs(form.datep),
            datef: inputToTs(form.datef),
            fulldayevent: form.fulldayevent ? 1 : 0,
            location: form.location,
            note: form.note,
            percentage: parseInt(form.percentage, 10) || 0,
        };
        if (form.socid !== "") payload.socid = parseInt(form.socid, 10) || 0;
        if (form.fkContact !== "") payload.fkContact = parseInt(form.fkContact, 10) || 0;
        if (form.fkUserAssigned !== "") {
            // fk_user_assigned is the right backend key (user_id is reserved by SmartAuth).
            payload.fkUserAssigned = parseInt(form.fkUserAssigned, 10) || 0;
        }
        return payload;
    };

    const handleSave = async () => {
        if (!form.label || form.label.trim() === "") {
            set("error", "Le libellé est obligatoire");
            return;
        }

        set("saving", true);
        set("error", null);
        try {
            const payload = buildPayload();
            if (isNew) {
                const created = await dbAgenda.create(payload);
                if (created?.id) {
                    navigate(`/agenda/${created.id}`, { replace: true });
                } else {
                    navigate("/agenda", { replace: true });
                }
            } else {
                await dbAgenda.update(id, payload);
                navigate(`/agenda/${id}`, { replace: true });
            }
        } catch (err) {
            console.error(isNew ? "dbAgenda.create error" : "dbAgenda.update error", err);
            set("error", "Enregistrement impossible");
        } finally {
            set("saving", false);
        }
    };

    const handleBack = () => {
        if (isNew) {
            navigate("/agenda");
        } else {
            navigate(`/agenda/${id}`);
        }
    };

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10 md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-4xl md:mx-auto">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">
                            {isNew ? "Nouvel évènement" : "Modifier l'évènement"}
                        </h1>
                    </div>
                </div>
            </div>

            <div className="p-4 pb-32 space-y-4 md:px-6 md:max-w-4xl md:mx-auto md:pb-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>
                )}

                {loading ? (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">
                                Libellé *
                            </label>
                            <input
                                type="text"
                                value={form.label}
                                onChange={(e) => updateField("label", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                                placeholder="Titre de l'évènement"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Type</label>
                            <select
                                value={form.typeCode}
                                onChange={(e) => updateField("typeCode", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            >
                                {TYPE_OPTIONS.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Début</label>
                            <input
                                type="datetime-local"
                                value={form.datep}
                                onChange={(e) => updateField("datep", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Fin</label>
                            <input
                                type="datetime-local"
                                value={form.datef}
                                onChange={(e) => updateField("datef", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                id="fulldayevent"
                                type="checkbox"
                                checked={!!form.fulldayevent}
                                onChange={(e) => updateField("fulldayevent", e.target.checked)}
                                className="w-4 h-4"
                            />
                            <label htmlFor="fulldayevent" className="text-sm font-medium text-gray-600">
                                Journée entière
                            </label>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Lieu</label>
                            <input
                                type="text"
                                value={form.location}
                                onChange={(e) => updateField("location", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none"
                                placeholder="Adresse, salle, lien..."
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">Note</label>
                            <textarea
                                value={form.note}
                                onChange={(e) => updateField("note", e.target.value)}
                                className="bg-white text-gray-900 p-3 rounded-lg border border-gray-200 focus:border-primary focus:outline-none min-h-[120px] resize-none"
                                placeholder="Détails de l'évènement..."
                            />
                        </div>

                        <SearchPicker
                            label="Tiers"
                            value={form.socid ? parseInt(form.socid, 10) : 0}
                            onChange={(id) => updateField("socid", id ? String(id) : "")}
                            endpoint="thirdparty"
                            placeholder="Rechercher un tiers..."
                            renderItem={(item) => ({
                                title: item.nom || item.name || `#${item.id}`,
                                subtitle: [item.town, item.country_code].filter(Boolean).join(", "),
                            })}
                            onCreateNew={() => navigate("/thirdparties/new?back=1")}
                            createLabel="Nouveau tiers"
                        />

                        <SearchPicker
                            label="Contact"
                            value={form.fkContact ? parseInt(form.fkContact, 10) : 0}
                            onChange={(id) => updateField("fkContact", id ? String(id) : "")}
                            endpoint="contact"
                            placeholder="Rechercher un contact..."
                            renderItem={(item) => ({
                                title: [item.firstname, item.lastname].filter(Boolean).join(" ") || `#${item.id}`,
                                subtitle: item.email || item.phone_mobile || "",
                            })}
                            onCreateNew={() => navigate("/contacts/new")}
                            createLabel="Nouveau contact"
                        />

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-600">
                                Avancement : {form.percentage ?? 0} %
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={form.percentage ?? 0}
                                onChange={(e) => updateField("percentage", parseInt(e.target.value, 10))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom action bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex gap-3 z-10 md:static md:border-0 md:bg-transparent md:p-0 md:mt-4 md:max-w-4xl md:mx-auto">
                <button
                    type="button"
                    onClick={handleBack}
                    disabled={saving}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                >
                    Annuler
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="flex-1 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                >
                    <FaSave className={saving ? "animate-pulse" : ""} />
                    {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
            </div>
        </Page>
    );
};
