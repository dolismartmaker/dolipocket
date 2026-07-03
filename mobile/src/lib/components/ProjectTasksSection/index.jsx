import { useEffect, useState, useCallback, Fragment } from "react";
import { FaListCheck, FaArrowsRotate, FaTrash, FaPlus, FaPen, FaCheck, FaXmark, FaClock } from "react-icons/fa6";
import toast from "react-hot-toast";

import { useDbTasks } from "src/db/stores/tasks/useDbTasks";
import { TaskTimePanel } from "src/lib/components/TaskTimePanel";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Tasks" section for the project detail desktop view (lot B3). Mirrors the
// Dolibarr project "Tasks" tab: lists the project tasks (indented by
// fk_task_parent), lets the user create a task, edit it inline (label, dates,
// planned workload, progress) and delete it. Time entry (timesheet) arrives in
// lot B4.
//
// Server side: task?project={id} + task CRUD via useDbTasks. Durations are in
// seconds server-side; the UI works in hours.
//
// Conventions UI desktop epurees (cf .claude/CLAUDE.md): border not shadow,
// tight density, transition-colors only.
//
// Props:
//   projectId  number  Required.
//   canWrite   bool    Show create/edit/delete controls (default false).
//   className  string  Optional extra class for the outer <section>.

const secToHours = (s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round((n / 3600) * 100) / 100;
};
const hoursToSec = (h) => {
    const n = Number(h);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 3600);
};
const tsToDateInput = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    return new Date(n * 1000).toISOString().slice(0, 10);
};
const dateInputToMs = (str) => {
    if (!str) return 0;
    const t = new Date(str).getTime();
    return Number.isFinite(t) ? t : 0;
};

// Compute an indent depth for each task from its parent chain.
const computeDepths = (tasks) => {
    const byId = new Map(tasks.map((t) => [Number(t.id), t]));
    const depthOf = (t, guard = 0) => {
        const parent = Number(t.fkTaskParent);
        if (!parent || !byId.has(parent) || guard > 20) return 0;
        return 1 + depthOf(byId.get(parent), guard + 1);
    };
    const map = new Map();
    tasks.forEach((t) => map.set(Number(t.id), depthOf(t)));
    return map;
};

const emptyDraft = { label: "", dateStart: "", dateEnd: "", plannedHours: "", fkTaskParent: "" };

export const ProjectTasksSection = ({ projectId, canWrite = false, className = "" }) => {
    const dbTasks = useDbTasks();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(0);
    const [editId, setEditId] = useState(0);
    const [editDraft, setEditDraft] = useState(emptyDraft);
    const [adding, setAdding] = useState(false);
    const [newDraft, setNewDraft] = useState(emptyDraft);
    const [timeTaskId, setTimeTaskId] = useState(0);

    const hasClient = !!dbTasks.list;

    const load = useCallback(async () => {
        if (!hasClient || !projectId) return;
        setLoading(true);
        setError(null);
        try {
            const rows = await dbTasks.list({ project: projectId });
            setTasks(Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error("ProjectTasksSection.load error", err);
            setError("Erreur de chargement des tâches");
            setTasks([]);
        } finally {
            setLoading(false);
        }
        // dbTasks is a fresh object each render; guard on stable ids only.
    }, [hasClient, projectId]);

    useEffect(() => {
        load();
    }, [hasClient, projectId, load]);

    const handleError = (err, fallback) => {
        const status = err?.response?.status ?? err?.status ?? null;
        if (status === 403) {
            notifyAccessDenied(err);
        } else {
            toast.error(fallback);
        }
    };

    const handleCreate = async () => {
        if (!newDraft.label.trim()) {
            toast.error("Le libellé de la tâche est obligatoire");
            return;
        }
        setAdding(true);
        try {
            await dbTasks.create({
                fkProject: Number(projectId),
                label: newDraft.label.trim(),
                dateStart: dateInputToMs(newDraft.dateStart),
                dateEnd: dateInputToMs(newDraft.dateEnd),
                plannedWorkload: hoursToSec(newDraft.plannedHours),
                fkTaskParent: newDraft.fkTaskParent ? Number(newDraft.fkTaskParent) : 0,
                progress: 0,
            });
            setNewDraft(emptyDraft);
            toast.success("Tâche créée");
            await load();
        } catch (err) {
            console.error("ProjectTasksSection.handleCreate error", err);
            handleError(err, "Création impossible");
        } finally {
            setAdding(false);
        }
    };

    const startEdit = (t) => {
        setEditId(Number(t.id));
        setEditDraft({
            label: t.label ?? "",
            dateStart: tsToDateInput(t.dateStart),
            dateEnd: tsToDateInput(t.dateEnd),
            plannedHours: t.plannedWorkload ? String(secToHours(t.plannedWorkload)) : "",
            progress: t.progress ?? 0,
        });
    };
    const cancelEdit = () => {
        setEditId(0);
        setEditDraft(emptyDraft);
    };

    const saveEdit = async (id) => {
        if (!editDraft.label.trim()) {
            toast.error("Le libellé est obligatoire");
            return;
        }
        setBusyId(id);
        try {
            await dbTasks.update(id, {
                label: editDraft.label.trim(),
                dateStart: dateInputToMs(editDraft.dateStart),
                dateEnd: dateInputToMs(editDraft.dateEnd),
                plannedWorkload: hoursToSec(editDraft.plannedHours),
                progress: Number(editDraft.progress) || 0,
            });
            cancelEdit();
            toast.success("Tâche mise à jour");
            await load();
        } catch (err) {
            console.error("ProjectTasksSection.saveEdit error", err);
            handleError(err, "Mise à jour impossible");
        } finally {
            setBusyId(0);
        }
    };

    const handleDelete = async (id) => {
        setBusyId(id);
        try {
            await dbTasks.remove(id);
            toast.success("Tâche supprimée");
            await load();
        } catch (err) {
            console.error("ProjectTasksSection.handleDelete error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 409) {
                toast.error("Impossible : la tâche a des sous-tâches ou est utilisée");
            } else {
                handleError(err, "Suppression impossible");
            }
        } finally {
            setBusyId(0);
        }
    };

    const depths = computeDepths(tasks);
    const inputCls = "h-[28px] px-2 rounded border border-soft-border text-[12px] focus:border-primary focus:outline-none";

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaListCheck className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Tâches</h2>
                    {!loading && <span className="text-[11px] text-soft-text">({tasks.length})</span>}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">{error}</div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="text-left text-soft-text border-b border-soft-border">
                            <th className="font-medium px-3 py-2">Tâche</th>
                            <th className="font-medium px-3 py-2 w-24 text-right">Début</th>
                            <th className="font-medium px-3 py-2 w-24 text-right">Fin</th>
                            <th className="font-medium px-3 py-2 w-20 text-right">Prévu (h)</th>
                            <th className="font-medium px-3 py-2 w-20 text-right">Passé (h)</th>
                            <th className="font-medium px-3 py-2 w-32">Avancement</th>
                            <th className="font-medium px-3 py-2 w-28 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && tasks.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-4 text-center text-soft-text">
                                    Aucune tâche
                                </td>
                            </tr>
                        )}
                        {tasks.map((t) => {
                            const isEdit = editId === Number(t.id);
                            const depth = depths.get(Number(t.id)) || 0;
                            const showTime = timeTaskId === Number(t.id);
                            return (
                              <Fragment key={t.id}>
                                <tr className="border-b border-soft-border/60 hover:bg-medium-bg/50 transition-colors">
                                    <td className="px-3 py-2">
                                        {isEdit ? (
                                            <input
                                                type="text"
                                                value={editDraft.label}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                                                className={`${inputCls} w-full`}
                                            />
                                        ) : (
                                            <div style={{ paddingLeft: `${depth * 16}px` }} className="text-strong-text">
                                                <span className="font-medium">{t.label}</span>
                                                {t.ref && <span className="ml-2 text-[11px] text-soft-text">{t.ref}</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        {isEdit ? (
                                            <input type="date" value={editDraft.dateStart}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, dateStart: e.target.value }))}
                                                className={inputCls} />
                                        ) : (tsToDateInput(t.dateStart) || "-")}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        {isEdit ? (
                                            <input type="date" value={editDraft.dateEnd}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, dateEnd: e.target.value }))}
                                                className={inputCls} />
                                        ) : (tsToDateInput(t.dateEnd) || "-")}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        {isEdit ? (
                                            <input type="number" step="0.25" min="0" value={editDraft.plannedHours}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, plannedHours: e.target.value }))}
                                                className={`${inputCls} w-16 text-right`} />
                                        ) : (secToHours(t.plannedWorkload) || "-")}
                                    </td>
                                    <td className="px-3 py-2 text-right">{secToHours(t.durationEffective) || "-"}</td>
                                    <td className="px-3 py-2">
                                        {isEdit ? (
                                            <input type="number" min="0" max="100" value={editDraft.progress}
                                                onChange={(e) => setEditDraft((d) => ({ ...d, progress: e.target.value }))}
                                                className={`${inputCls} w-16 text-right`} />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-medium-bg rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, Number(t.progress) || 0)}%` }} />
                                                </div>
                                                <span className="text-[11px] text-soft-text w-8 text-right">{Number(t.progress) || 0}%</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                            <button type="button" onClick={() => setTimeTaskId(showTime ? 0 : Number(t.id))}
                                                className={`h-[26px] px-2 rounded text-[11px] border transition-colors ${showTime ? "bg-primary/10 border-primary text-primary" : "bg-white border-soft-border text-strong-text hover:bg-medium-bg"}`}
                                                title="Temps passé">
                                                <FaClock className="text-[10px]" />
                                            </button>
                                            {canWrite && (isEdit ? (
                                                <>
                                                    <button type="button" onClick={() => saveEdit(Number(t.id))} disabled={busyId === Number(t.id)}
                                                        className="h-[26px] px-2 rounded text-[11px] bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors" title="Enregistrer">
                                                        <FaCheck className="text-[10px]" />
                                                    </button>
                                                    <button type="button" onClick={cancelEdit}
                                                        className="h-[26px] px-2 rounded text-[11px] bg-white border border-soft-border text-soft-text hover:bg-medium-bg transition-colors" title="Annuler">
                                                        <FaXmark className="text-[10px]" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button type="button" onClick={() => startEdit(t)}
                                                        className="h-[26px] px-2 rounded text-[11px] bg-white border border-soft-border text-strong-text hover:bg-medium-bg transition-colors" title="Modifier">
                                                        <FaPen className="text-[10px]" />
                                                    </button>
                                                    <button type="button" onClick={() => handleDelete(Number(t.id))} disabled={busyId === Number(t.id)}
                                                        className="h-[26px] px-2 rounded text-[11px] bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors" title="Supprimer">
                                                        <FaTrash className="text-[10px]" />
                                                    </button>
                                                </>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                                {showTime && (
                                    <tr>
                                        <td colSpan={7} className="p-0">
                                            <TaskTimePanel taskId={Number(t.id)} dataSource={dbTasks} canWrite={canWrite} />
                                        </td>
                                    </tr>
                                )}
                              </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {canWrite && (
                <div className="border-t border-soft-border px-3 py-2.5 flex flex-col gap-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
                            <span className="text-[11px] text-soft-text">Nouvelle tâche</span>
                            <input type="text" value={newDraft.label}
                                onChange={(e) => setNewDraft((d) => ({ ...d, label: e.target.value }))}
                                placeholder="Libellé" className={inputCls} />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-soft-text">Parent</span>
                            <select value={newDraft.fkTaskParent}
                                onChange={(e) => setNewDraft((d) => ({ ...d, fkTaskParent: e.target.value }))}
                                className={inputCls}>
                                <option value="">(racine)</option>
                                {tasks.map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-soft-text">Début</span>
                            <input type="date" value={newDraft.dateStart}
                                onChange={(e) => setNewDraft((d) => ({ ...d, dateStart: e.target.value }))}
                                className={inputCls} />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-soft-text">Fin</span>
                            <input type="date" value={newDraft.dateEnd}
                                onChange={(e) => setNewDraft((d) => ({ ...d, dateEnd: e.target.value }))}
                                className={inputCls} />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] text-soft-text">Prévu (h)</span>
                            <input type="number" step="0.25" min="0" value={newDraft.plannedHours}
                                onChange={(e) => setNewDraft((d) => ({ ...d, plannedHours: e.target.value }))}
                                className={`${inputCls} w-20`} />
                        </label>
                        <button type="button" onClick={handleCreate} disabled={adding || !newDraft.label.trim()}
                            className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                            <FaPlus className="text-[11px]" />
                            <span>Ajouter</span>
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};
