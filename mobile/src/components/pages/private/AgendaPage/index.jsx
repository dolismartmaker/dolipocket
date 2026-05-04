import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaPlus, FaCalendarDay, FaMapMarkerAlt, FaCheckCircle, FaRegClock } from "react-icons/fa";

import { Page, useStates } from "@cap-rel/smartcommon";

import { useDbAgenda } from "src/db/stores/agenda/useDbAgenda";

// Compute the start/end timestamps (seconds) for the requested period from "now".
const computeRange = (period) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    let endDate = new Date(startOfToday);

    if (period === "day") {
        endDate.setDate(endDate.getDate() + 1);
    } else if (period === "week") {
        endDate.setDate(endDate.getDate() + 7);
    } else {
        // month
        endDate.setMonth(endDate.getMonth() + 1);
    }

    return {
        start: Math.floor(startOfToday.getTime() / 1000),
        end: Math.floor(endDate.getTime() / 1000),
    };
};

const PERIODS = [
    { key: "day", label: "Jour" },
    { key: "week", label: "Semaine" },
    { key: "month", label: "Mois" },
];

// Format unix seconds to "DD/MM HH:mm" in local timezone.
const formatEventDate = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
};

export const AgendaPage = () => {
    const navigate = useNavigate();
    const dbAgenda = useDbAgenda();
    const hasClient = !!dbAgenda.list;

    const { states, set } = useStates({
        items: [],
        loading: false,
        error: null,
        period: "week",
        onlyMine: true,
    });

    const { items, loading, error, period, onlyMine } = states ?? {};

    useEffect(() => {
        if (!hasClient) return;
        loadEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, period, onlyMine]);

    const loadEvents = async () => {
        set("loading", true);
        set("error", null);
        try {
            const range = computeRange(period);
            // No fk_user_assigned -> backend returns events visible to current user.
            // The "onlyMine" toggle only matters for admins/users with allactions:
            // for them we restrict via fk_user_assigned to clarify the listing.
            // We do not have the connected user id here, we leave the filter
            // out and rely on backend visibility scoping (myactions only when
            // allactions is missing).
            const rows = await dbAgenda.list({
                start: range.start,
                end: range.end,
            });
            set("items", Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("dbAgenda.list error", err);
            set("error", "Erreur de chargement de l'agenda");
        } finally {
            set("loading", false);
        }
    };

    const handleBack = () => navigate("/");
    const handleCreate = () => navigate("/agenda/new");
    const handleOpen = (id) => navigate(`/agenda/${id}`);

    return (
        <Page contentProps={{ className: "bg-gray-50 min-h-screen" }}>
            {/* Header */}
            <div className="bg-gradient-to-r from-primary to-secondary p-4 text-white sticky top-0 z-10 md:bg-none md:bg-white md:text-gray-800 md:border-b md:border-gray-200">
                <div className="flex items-center gap-3 md:max-w-5xl md:mx-auto">
                    <button onClick={handleBack} className="p-2 -ml-2 md:hidden" aria-label="Retour">
                        <FaArrowLeft />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-lg font-bold">Agenda</h1>
                        <p className="text-sm text-white/80 md:text-gray-500">Vos évènements à venir</p>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="p-2 bg-white/20 rounded-full"
                        aria-label="Creer un evenement"
                    >
                        <FaPlus />
                    </button>
                </div>

                {/* Period chips */}
                <div className="mt-3 flex gap-2 md:max-w-5xl md:mx-auto">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => set("period", p.key)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                                period === p.key
                                    ? "bg-white text-primary"
                                    : "bg-white/20 text-white"
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 pb-24 md:px-6 md:max-w-5xl md:mx-auto">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">
                        {error}
                        <button onClick={loadEvents} className="ml-2 underline">
                            Réessayer
                        </button>
                    </div>
                )}

                {loading && (items?.length ?? 0) === 0 && (
                    <div className="text-center text-gray-500 py-8">Chargement...</div>
                )}

                {!loading && (items?.length ?? 0) === 0 && !error && (
                    <div className="text-center text-gray-500 py-12">
                        <FaCalendarDay className="mx-auto text-4xl mb-3 text-gray-300" />
                        <div>Aucun évènement sur la période</div>
                    </div>
                )}

                <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
                    {items?.map((ev) => {
                        const isDone = ev.percentage >= 100;
                        return (
                            <li key={ev.id}>
                                <button
                                    type="button"
                                    onClick={() => handleOpen(ev.id)}
                                    className="w-full text-left bg-white p-3 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg ${isDone ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"}`}>
                                            {isDone ? <FaCheckCircle /> : <FaRegClock />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-800 truncate">
                                                {ev.label || "(sans titre)"}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {formatEventDate(ev.datep)}
                                                {ev.datef ? " -> " + formatEventDate(ev.datef) : ""}
                                            </div>
                                            {ev.location && (
                                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <FaMapMarkerAlt className="shrink-0" />
                                                    <span className="truncate">{ev.location}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

        </Page>
    );
};
