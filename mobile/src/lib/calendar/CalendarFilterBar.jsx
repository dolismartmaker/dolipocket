import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaChevronDown, FaXmark, FaRobot, FaCheck, FaBookmark, FaCakeCandles } from "react-icons/fa6";

import { FkPicker } from "src/lib/forms/FkPicker";

import { getTypeMeta } from "./eventTypes";

// Desktop filter bar for the agenda calendar (cf docs/AGENDA_FILTERS_SPEC.md
// section 3, B-front-1 + B-front-2). Presentational: every piece of state +
// every mutator comes from the `filters` controller built in useAgendaData().
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md): borders not shadows
// (except the floating panels), density tight, no transition-all, no
// rounded-2xl, no active: on desktop.

const PRESET_KEYS = ["all", "mine", "todo", "overdue", "done"];
const STATUS_VALUES = ["todo", "0", "50", "done", "na"];

// Small shared control classes.
const CONTROL =
    "h-8 px-2.5 rounded-md text-[13px] font-medium border border-soft-border text-strong-text bg-white hover:bg-medium-bg transition-colors";

// Preset key -> counts field (undefined = no badge, e.g. "Tout" total).
const PRESET_COUNT = { all: "total", mine: "mine", todo: "todo", overdue: "overdue", done: "done" };

export const CalendarFilterBar = ({
    value,
    options,
    counts,
    activePreset,
    hasActive,
    canAssignToMe,
    savedViews = [],
    applyPreset,
    toggleType,
    setStatus,
    toggleHideAuto,
    update,
    clear,
    saveView,
    applyView,
    deleteView,
}) => {
    const { t } = useTranslation("agenda");
    const [typeOpen, setTypeOpen] = useState(false);
    const [viewsOpen, setViewsOpen] = useState(false);
    const [newViewName, setNewViewName] = useState("");
    const typeRef = useRef(null);
    const viewsRef = useRef(null);

    // Close the type panel on outside click / Escape.
    useEffect(() => {
        if (!typeOpen) return undefined;
        const onDown = (e) => {
            if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false);
        };
        const onKey = (e) => e.key === "Escape" && setTypeOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [typeOpen]);

    // Close the saved-views panel on outside click / Escape.
    useEffect(() => {
        if (!viewsOpen) return undefined;
        const onDown = (e) => {
            if (viewsRef.current && !viewsRef.current.contains(e.target)) setViewsOpen(false);
        };
        const onKey = (e) => e.key === "Escape" && setViewsOpen(false);
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [viewsOpen]);

    const types = Array.isArray(options?.types) ? options.types : [];
    const groups = Array.isArray(options?.groups) ? options.groups : [];
    const selectedTypes = value?.types ?? [];
    const presets = PRESET_KEYS.filter((k) => k !== "mine" || canAssignToMe);
    const statusLabel = (v) => t(`filters.status.${v}`, v);

    // --- Active chips (removable summary of every non-preset facet) ----------
    const chips = [];
    if (value?.assignedToMe) {
        chips.push({ key: "mine", label: t("filters.presets.mine"), onRemove: () => update({ assignedToMe: false }) });
    }
    if (value?.overdue) {
        chips.push({ key: "overdue", label: t("filters.presets.overdue"), onRemove: () => update({ overdue: false }) });
    }
    if (value?.status) {
        chips.push({ key: "status", label: statusLabel(value.status), onRemove: () => update({ status: "" }) });
    }
    selectedTypes.forEach((code) => {
        const label = types.find((tp) => tp.code === code)?.label || code;
        chips.push({ key: `type-${code}`, label, onRemove: () => toggleType(code) });
    });
    if (value?.hideAuto) {
        chips.push({ key: "hideAuto", label: t("filters.hide-auto"), onRemove: () => toggleHideAuto() });
    }
    if (value?.showBirthday) {
        chips.push({ key: "birthday", label: t("filters.birthday"), onRemove: () => update({ showBirthday: false }) });
    }
    if (value?.socid > 0) {
        chips.push({ key: "socid", label: t("filters.thirdparty"), onRemove: () => update({ socid: 0 }) });
    }
    if (value?.projectid > 0) {
        chips.push({ key: "projectid", label: t("filters.project"), onRemove: () => update({ projectid: 0 }) });
    }
    if (value?.resourceid > 0) {
        chips.push({ key: "resourceid", label: t("filters.resource"), onRemove: () => update({ resourceid: 0 }) });
    }
    if (value?.usergroup > 0) {
        const gLabel = groups.find((g) => g.id === value.usergroup)?.label || t("filters.group");
        chips.push({ key: "usergroup", label: gLabel, onRemove: () => update({ usergroup: 0 }) });
    }

    return (
        <div
            data-testid="agenda-filter-bar"
            className="shrink-0 border-b border-soft-border bg-white"
        >
            {/* Controls row */}
            <div className="flex items-center gap-2 flex-wrap px-3 py-2 md:px-4">
                {/* Presets */}
                <div className="flex items-center gap-1">
                    {presets.map((key) => {
                        const isActive = activePreset === key;
                        const countField = PRESET_COUNT[key];
                        const count = countField ? counts?.[countField] : undefined;
                        return (
                            <button
                                key={key}
                                type="button"
                                data-testid={`agenda-preset-${key}`}
                                onClick={() => applyPreset(key)}
                                className={
                                    "h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium border transition-colors " +
                                    (isActive
                                        ? "bg-primary text-white border-primary"
                                        : "border-soft-border text-strong-text hover:bg-medium-bg")
                                }
                            >
                                {t(`filters.presets.${key}`)}
                                {typeof count === "number" && (
                                    <span
                                        data-testid={`agenda-preset-count-${key}`}
                                        className={
                                            "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold " +
                                            (isActive ? "bg-white/25 text-white" : "bg-medium-bg text-soft-text")
                                        }
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <span className="h-5 w-px bg-soft-border" aria-hidden="true" />

                {/* Status select */}
                <select
                    data-testid="agenda-status-select"
                    value={value?.status || ""}
                    onChange={(e) => setStatus(e.target.value)}
                    className={CONTROL + (value?.status ? " border-primary text-primary bg-primary/5" : "")}
                >
                    <option value="">{t("filters.status-all", "Statut")}</option>
                    {STATUS_VALUES.map((v) => (
                        <option key={v} value={v}>{statusLabel(v)}</option>
                    ))}
                </select>

                {/* Type multi-select */}
                <div className="relative" ref={typeRef}>
                    <button
                        type="button"
                        data-testid="agenda-type-toggle"
                        onClick={() => setTypeOpen((o) => !o)}
                        className={
                            "h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium border transition-colors " +
                            (selectedTypes.length
                                ? "border-primary text-primary bg-primary/5"
                                : "border-soft-border text-strong-text hover:bg-medium-bg")
                        }
                    >
                        {t("filters.type", "Type")}
                        {selectedTypes.length > 0 && (
                            <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold">
                                {selectedTypes.length}
                            </span>
                        )}
                        <FaChevronDown className="text-[10px] opacity-70" />
                    </button>

                    {typeOpen && (
                        <div className="absolute z-40 mt-1 w-64 max-h-72 overflow-auto rounded-lg border border-soft-border bg-white shadow-lg p-1">
                            {types.length === 0 && (
                                <p className="px-2 py-2 text-[13px] text-soft-text">
                                    {t("filters.types-empty", "Aucun type disponible")}
                                </p>
                            )}
                            {types.map((type) => {
                                const checked = selectedTypes.includes(type.code);
                                const meta = getTypeMeta(type.code);
                                return (
                                    <button
                                        key={type.id}
                                        type="button"
                                        data-testid="agenda-type-option"
                                        onClick={() => toggleType(type.code)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] hover:bg-medium-bg transition-colors"
                                    >
                                        <span
                                            className={
                                                "grid place-items-center w-4 h-4 rounded border " +
                                                (checked
                                                    ? "bg-primary border-primary text-white"
                                                    : "border-soft-border")
                                            }
                                        >
                                            {checked && <FaCheck className="text-[9px]" />}
                                        </span>
                                        <span className={"w-2 h-2 rounded-full " + meta.dot} />
                                        <span className="flex-1 truncate text-strong-text">{type.label || type.code}</span>
                                        {type.systemauto && (
                                            <FaRobot className="text-[11px] text-soft-text" title="auto" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Hide auto toggle */}
                <button
                    type="button"
                    data-testid="agenda-hideauto"
                    onClick={toggleHideAuto}
                    aria-pressed={!!value?.hideAuto}
                    className={
                        "h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium border transition-colors " +
                        (value?.hideAuto
                            ? "border-primary text-primary bg-primary/5"
                            : "border-soft-border text-strong-text hover:bg-medium-bg")
                    }
                >
                    <FaRobot className="text-[12px]" />
                    {t("filters.hide-auto", "Masquer les auto")}
                </button>

                {/* Show birthdays toggle */}
                <button
                    type="button"
                    data-testid="agenda-birthday"
                    onClick={() => update({ showBirthday: !value?.showBirthday })}
                    aria-pressed={!!value?.showBirthday}
                    className={
                        "h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium border transition-colors " +
                        (value?.showBirthday
                            ? "border-primary text-primary bg-primary/5"
                            : "border-soft-border text-strong-text hover:bg-medium-bg")
                    }
                >
                    <FaCakeCandles className="text-[12px]" />
                    {t("filters.birthday", "Anniversaires")}
                </button>

                <span className="h-5 w-px bg-soft-border" aria-hidden="true" />

                {/* Third party picker */}
                <div className="w-44" data-testid="agenda-thirdparty-picker">
                    <FkPicker
                        endpoint="thirdparty"
                        value={value?.socid || 0}
                        onChange={(id) => update({ socid: Number(id) || 0 })}
                        placeholder={t("filters.thirdparty", "Tiers")}
                    />
                </div>

                {/* Project picker */}
                <div className="w-44" data-testid="agenda-project-picker">
                    <FkPicker
                        endpoint="project"
                        value={value?.projectid || 0}
                        onChange={(id) => update({ projectid: Number(id) || 0 })}
                        placeholder={t("filters.project", "Projet")}
                    />
                </div>

                {/* Resource picker */}
                <div className="w-44" data-testid="agenda-resource-picker">
                    <FkPicker
                        endpoint="resource"
                        value={value?.resourceid || 0}
                        onChange={(id) => update({ resourceid: Number(id) || 0 })}
                        placeholder={t("filters.resource", "Ressource")}
                    />
                </div>

                {/* Group select (only when the caller may enumerate groups) */}
                {groups.length > 0 && (
                    <select
                        data-testid="agenda-group-select"
                        value={value?.usergroup || ""}
                        onChange={(e) => update({ usergroup: Number(e.target.value) || 0 })}
                        className={CONTROL + (value?.usergroup ? " border-primary text-primary bg-primary/5" : "")}
                    >
                        <option value="">{t("filters.group-all", "Groupe")}</option>
                        {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                    </select>
                )}

                {/* Saved views */}
                <div className="relative" ref={viewsRef}>
                    <button
                        type="button"
                        data-testid="agenda-views-toggle"
                        onClick={() => setViewsOpen((o) => !o)}
                        className={CONTROL + " inline-flex items-center gap-1.5"}
                    >
                        <FaBookmark className="text-[11px]" />
                        {t("filters.views", "Vues")}
                        {savedViews.length > 0 && (
                            <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-medium-bg text-soft-text text-[10px] font-semibold">
                                {savedViews.length}
                            </span>
                        )}
                        <FaChevronDown className="text-[10px] opacity-70" />
                    </button>

                    {viewsOpen && (
                        <div className="absolute z-40 mt-1 w-64 rounded-lg border border-soft-border bg-white shadow-lg p-1">
                            {savedViews.length === 0 && (
                                <p className="px-2 py-2 text-[13px] text-soft-text">
                                    {t("filters.views-empty", "Aucune vue enregistrée")}
                                </p>
                            )}
                            {savedViews.map((v) => (
                                <div
                                    key={v.id}
                                    data-testid="agenda-view-item"
                                    className="flex items-center gap-1 rounded-md hover:bg-medium-bg transition-colors"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            applyView(v.id);
                                            setViewsOpen(false);
                                        }}
                                        className="flex-1 min-w-0 text-left px-2 py-1.5 text-[13px] text-strong-text truncate"
                                    >
                                        {v.name}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => deleteView(v.id)}
                                        aria-label={t("filters.remove", "Retirer")}
                                        className="grid place-items-center w-6 h-6 mr-1 rounded text-soft-text hover:text-strong-text hover:bg-soft-border/40 transition-colors"
                                    >
                                        <FaXmark className="text-[11px]" />
                                    </button>
                                </div>
                            ))}
                            {/* Save current */}
                            <div className="flex items-center gap-1 border-t border-soft-border mt-1 pt-1 p-1">
                                <input
                                    data-testid="agenda-view-name"
                                    value={newViewName}
                                    onChange={(e) => setNewViewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && newViewName.trim()) {
                                            saveView(newViewName);
                                            setNewViewName("");
                                        }
                                    }}
                                    placeholder={t("filters.view-name", "Nom de la vue")}
                                    className="flex-1 min-w-0 h-8 px-2 rounded-md border border-soft-border text-[13px] text-strong-text focus:outline-none focus:border-primary"
                                />
                                <button
                                    type="button"
                                    data-testid="agenda-view-save"
                                    disabled={!newViewName.trim()}
                                    onClick={() => {
                                        saveView(newViewName);
                                        setNewViewName("");
                                    }}
                                    className="h-8 px-3 rounded-md text-[13px] font-medium bg-primary text-white hover:brightness-110 transition-[filter] disabled:opacity-40"
                                >
                                    {t("filters.save", "Enregistrer")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Clear */}
                {hasActive && (
                    <button
                        type="button"
                        data-testid="agenda-filter-clear"
                        onClick={clear}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-soft-text hover:text-strong-text hover:bg-medium-bg transition-colors ml-auto"
                    >
                        <FaXmark className="text-[12px]" />
                        {t("filters.clear", "Effacer")}
                    </button>
                )}
            </div>

            {/* Active chips row */}
            {chips.length > 0 && (
                <div
                    data-testid="agenda-filter-chips"
                    className="flex items-center gap-1.5 flex-wrap px-3 pb-2 md:px-4"
                >
                    {chips.map((chip) => (
                        <span
                            key={chip.key}
                            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-primary/10 text-primary text-[12px] font-medium"
                        >
                            {chip.label}
                            <button
                                type="button"
                                onClick={chip.onRemove}
                                className="grid place-items-center w-4 h-4 rounded-full hover:bg-primary/20 transition-colors"
                                aria-label={t("filters.remove", "Retirer")}
                            >
                                <FaXmark className="text-[9px]" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
