import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaPen, FaTrash, FaCheckCircle, FaMapMarkerAlt, FaRegStickyNote, FaUser, FaBuilding, FaCalendarAlt } from "react-icons/fa";

import { Page, useStates, useConfirm } from "@cap-rel/smartcommon";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Format unix seconds to "DD/MM/YYYY HH:mm" in local timezone.
const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

const Field = ({ label, value, icon: Icon }) => {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex items-start gap-3">
            {Icon && (
                <div className="bg-primary/10 text-primary p-2 rounded-lg shrink-0">
                    <Icon />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-400 uppercase block">{label}</span>
                <span className="text-gray-700 break-words whitespace-pre-wrap">{String(value)}</span>
            </div>
        </div>
    );
};

export const AgendaEventPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const { confirm } = useConfirm();

    const { states, set } = useStates({
        item: null,
        loading: true,
        error: null,
        actionPending: false,
    });

    const { item, loading, error, actionPending } = states ?? {};

    const hasClient = !!dbAgenda.list;

    useEffect(() => {
        if (!hasClient || !id) return;
        loadEvent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, id]);

    const loadEvent = async () => {
        set("loading", true);
        set("error", null);
        try {
            const data = await dbAgenda.get(id);
            set("item", data);
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

    const handleBack = () => navigate("/agenda");
    const handleEdit = () => navigate(`/agenda/${id}/edit`);

    const handleDone = async () => {
        set("actionPending", true);
        try {
            const data = await dbAgenda.markDone(id);
            set("item", data);
        } catch (err) {
            console.error("dbAgenda.markDone error", err);
            set("error", "Impossible de marquer comme terminé");
        } finally {
            set("actionPending", false);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            type: "delete",
            title: "Supprimer cet évènement ?",
            message: "Cette action est irréversible.",
        });
        if (!ok) return;

        set("actionPending", true);
        try {
            await dbAgenda.remove(id);
            navigate("/agenda");
        } catch (err) {
            console.error("dbAgenda.remove error", err);
            set("error", "Suppression impossible");
            set("actionPending", false);
        }
    };

    const isDone = (item?.percentage ?? 0) >= 100;

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10 md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-lg font-bold truncate">
                            {loading ? "Chargement..." : item?.label || "Évènement"}
                        </h1>
                        {item?.ref && (
                            <p className="text-sm text-white/80 truncate">{item.ref}</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 pb-32 space-y-3 md:px-6 md:max-w-5xl md:mx-auto md:pb-4">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                        {error}
                        <button onClick={loadEvent} className="ml-2 underline">Réessayer</button>
                    </div>
                )}

                {loading && !item && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {item && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        {isDone && (
                            <div className="flex items-center gap-2 bg-green-100 text-green-700 px-3 py-2 rounded-lg">
                                <FaCheckCircle />
                                <span className="text-sm font-medium">Évènement terminé</span>
                            </div>
                        )}

                        <Field
                            label="Type"
                            value={item.typeCode}
                            icon={FaCalendarAlt}
                        />
                        <Field
                            label="Début"
                            value={formatTimestamp(item.datep)}
                            icon={FaCalendarAlt}
                        />
                        <Field
                            label="Fin"
                            value={formatTimestamp(item.datef)}
                            icon={FaCalendarAlt}
                        />
                        {!!item.fulldayevent && (
                            <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full inline-block">
                                Journée entière
                            </div>
                        )}
                        <Field label="Lieu" value={item.location} icon={FaMapMarkerAlt} />
                        <Field label="Note" value={item.note} icon={FaRegStickyNote} />
                        <Field
                            label="Utilisateur assigné"
                            value={item.fkUserAssigned ? "#" + item.fkUserAssigned : null}
                            icon={FaUser}
                        />
                        <Field
                            label="Tiers lié"
                            value={item.socid ? "#" + item.socid : null}
                            icon={FaBuilding}
                        />
                        {item.elementtype && item.fkElement ? (
                            <Field
                                label="Objet lié"
                                value={item.elementtype + " #" + item.fkElement}
                            />
                        ) : null}
                        <Field
                            label="Avancement"
                            value={(item.percentage ?? 0) + " %"}
                        />
                    </div>
                )}
            </div>

            {/* Bottom action bar */}
            {item && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex gap-3 z-10 md:static md:border-0 md:bg-transparent md:p-0 md:mt-4 md:max-w-5xl md:mx-auto">
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={actionPending}
                        className="flex-1 py-3 bg-red-100 text-red-600 rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                    >
                        <FaTrash /> Supprimer
                    </button>
                    {!isDone && (
                        <button
                            type="button"
                            onClick={handleDone}
                            disabled={actionPending}
                            className="flex-1 py-3 bg-green-100 text-green-700 rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                        >
                            <FaCheckCircle /> Terminer
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleEdit}
                        disabled={actionPending}
                        className="flex-1 py-3 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                    >
                        <FaPen /> Éditer
                    </button>
                </div>
            )}
        </Page>
    );
};
