import { useEffect, useState, useCallback } from "react";
import { FaClock, FaTrash, FaPlus } from "react-icons/fa6";
import toast from "react-hot-toast";

import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// Time-spent panel for a single task (lot B4). Lists the time entries, shows
// the total, and lets the user log new time (date + hours/minutes + note) or
// delete an entry. Rendered inline (expandable) inside ProjectTasksSection.
//
// Server side: task/{id}/timespent(/summary) via useDbTasks. Durations are in
// seconds; the UI works in hours + minutes.
//
// Props:
//   taskId     number  Required.
//   dataSource object  Required. useDbTasks() instance.
//   canWrite   bool    Show the add/delete controls.

const secToHM = (s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return "0h";
    const h = Math.floor(n / 3600);
    const m = Math.round((n % 3600) / 60);
    return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};
const fmtDate = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toLocaleDateString("fr-FR");
};
const todayInput = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateInputToMs = (str) => {
    if (!str) return 0;
    const t = new Date(str).getTime();
    return Number.isFinite(t) ? t : 0;
};

export const TaskTimePanel = ({ taskId, dataSource, canWrite = false }) => {
    const [lines, setLines] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(0);
    const [adding, setAdding] = useState(false);
    const [date, setDate] = useState(todayInput());
    const [hours, setHours] = useState("");
    const [minutes, setMinutes] = useState("");
    const [note, setNote] = useState("");

    const hasClient = !!(dataSource && dataSource.listTime);

    const load = useCallback(async () => {
        if (!hasClient || !taskId) return;
        setLoading(true);
        setError(null);
        try {
            const [rows, summary] = await Promise.all([
                dataSource.listTime(taskId),
                dataSource.timeSummary(taskId).catch(() => ({})),
            ]);
            setLines(Array.isArray(rows) ? rows : []);
            setTotal(Number(summary?.totalDuration ?? 0));
        } catch (err) {
            console.error("TaskTimePanel.load error", err);
            setError("Erreur de chargement du temps passé");
            setLines([]);
        } finally {
            setLoading(false);
        }
    }, [hasClient, taskId]);

    useEffect(() => {
        load();
    }, [hasClient, taskId, load]);

    const handleError = (err, fallback) => {
        const status = err?.response?.status ?? err?.status ?? null;
        if (status === 403) notifyAccessDenied(err);
        else toast.error(fallback);
    };

    const handleAdd = async () => {
        const duration = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
        if (duration <= 0) {
            toast.error("Saisissez une durée (heures / minutes)");
            return;
        }
        setAdding(true);
        try {
            const rows = await dataSource.addTime(taskId, {
                date: dateInputToMs(date),
                duration,
                note: note ?? "",
            });
            setLines(Array.isArray(rows) ? rows : []);
            setHours("");
            setMinutes("");
            setNote("");
            toast.success("Temps ajouté");
            const summary = await dataSource.timeSummary(taskId).catch(() => ({}));
            setTotal(Number(summary?.totalDuration ?? 0));
        } catch (err) {
            console.error("TaskTimePanel.handleAdd error", err);
            handleError(err, "Ajout du temps impossible");
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (tsid) => {
        setBusyId(tsid);
        try {
            const rows = await dataSource.deleteTime(taskId, tsid);
            setLines(Array.isArray(rows) ? rows : []);
            const summary = await dataSource.timeSummary(taskId).catch(() => ({}));
            setTotal(Number(summary?.totalDuration ?? 0));
        } catch (err) {
            console.error("TaskTimePanel.handleDelete error", err);
            handleError(err, "Suppression du temps impossible");
        } finally {
            setBusyId(0);
        }
    };

    const inputCls = "h-[26px] px-2 rounded border border-soft-border text-[12px] focus:border-primary focus:outline-none";

    return (
        <div className="bg-medium-bg/40 border-t border-soft-border px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
                <FaClock className="text-soft-text text-xs" />
                <span className="text-[12px] font-semibold text-strong-text">Temps passé</span>
                <span className="text-[11px] text-soft-text">total {secToHM(total)}</span>
            </div>

            {error && <div className="text-[12px] text-red-700 mb-2">{error}</div>}

            {loading && lines.length === 0 && (
                <div className="text-[12px] text-soft-text">Chargement...</div>
            )}
            {!loading && lines.length === 0 && (
                <div className="text-[12px] text-soft-text">Aucun temps saisi</div>
            )}

            {lines.length > 0 && (
                <ul className="flex flex-col gap-1 mb-2">
                    {lines.map((l) => (
                        <li key={l.id} className="flex items-center gap-3 text-[12px] text-strong-text">
                            <span className="w-20 text-soft-text">{fmtDate(l.date)}</span>
                            <span className="w-16 font-medium">{secToHM(l.duration)}</span>
                            <span className="flex-1 min-w-0 truncate text-soft-text">
                                {l.userName || `#${l.fkUser}`}{l.note ? ` - ${l.note}` : ""}
                            </span>
                            {canWrite && (
                                <button
                                    type="button"
                                    onClick={() => handleDelete(l.id)}
                                    disabled={busyId === l.id}
                                    className="h-[24px] px-2 rounded text-[11px] bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                    title="Supprimer"
                                >
                                    <FaTrash className="text-[10px]" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canWrite && (
                <div className="flex flex-wrap items-end gap-2 pt-1">
                    <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-soft-text">Date</span>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-soft-text">Heures</span>
                        <input type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} className={`${inputCls} w-16`} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-soft-text">Minutes</span>
                        <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${inputCls} w-16`} />
                    </label>
                    <label className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                        <span className="text-[10px] text-soft-text">Note</span>
                        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
                    </label>
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={adding}
                        className="h-[26px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                        <FaPlus className="text-[10px]" />
                        <span>Ajouter</span>
                    </button>
                </div>
            )}
        </div>
    );
};
