import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FaXmark, FaArrowRight, FaCircleCheck, FaClock, FaMapPin } from "react-icons/fa6";
import { fmtTime, tsToDate } from "./dateUtils";
import { getTypeMeta } from "./eventTypes";

// Quick event popup: show details + quick edit + link to full details page.
// Triggered by click (not hover, to avoid mobile touch issues).
//
// The component is kept MOUNTED by the parent (only `isOpen`/`event` toggle),
// so the local edit state MUST be re-synced whenever the event changes --
// otherwise a title typed for event A leaks into event B's popup (and the
// popup stays stuck in edit mode). The effect below does exactly that.
export const EventQuickView = ({
    event,
    isOpen,
    onClose,
    onUpdate,
    onOpenFull,
}) => {
    const { t } = useTranslation("agenda");
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [label, setLabel] = useState(event?.label || "");
    const [note, setNote] = useState(event?.note || "");
    const [formError, setFormError] = useState("");

    // Re-sync edit state on event change (and reset the edit mode). Keyed on the
    // event id so switching events never carries over the previous draft.
    useEffect(() => {
        setLabel(event?.label || "");
        setNote(event?.note || "");
        setIsEditing(false);
        setFormError("");
    }, [event?.id]);

    const handleSave = async () => {
        if (!event?.id) return;
        // Label is mandatory (mirrors the full edit form + backend).
        if (!label || label.trim() === "") {
            setFormError(t("edit.label-required", "Le libellé est obligatoire"));
            return;
        }
        if (typeof onUpdate !== "function") {
            console.error("[EventQuickView] onUpdate not wired");
            toast.error(t("toasts.save-error", "Impossible d'enregistrer l'événement"));
            return;
        }
        setSaving(true);
        setFormError("");
        try {
            const result = await onUpdate(event.id, { label: label.trim(), note });
            if (result) {
                toast.success(t("toasts.update-success", "Événement mis à jour"));
                setIsEditing(false);
                onClose();
            } else {
                toast.error(t("toasts.save-error", "Impossible d'enregistrer l'événement"));
            }
        } catch (err) {
            console.error("[EventQuickView] save error", err);
            toast.error(t("toasts.save-error", "Impossible d'enregistrer l'événement"));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !event) return null;

    const meta = getTypeMeta(event.typeCode);
    const Icon = meta.Icon;
    const isDone = (event.percentage ?? 0) >= 100;
    const startDate = tsToDate(event.datep);
    const endDate = tsToDate(event.datef);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg border border-soft-border max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 flex items-center justify-between gap-3 bg-gradient-to-r from-white to-medium-bg/50 px-4 py-3 border-b border-soft-border">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-lg ${meta.chip}`}>
                            <Icon className="text-base" />
                        </span>
                        <div className="min-w-0">
                            <div
                                className={`text-base font-bold text-strong-text truncate ${
                                    isDone ? "line-through opacity-60" : ""
                                }`}
                            >
                                {event.label || "-"}
                            </div>
                            {event.typeCode && (
                                <div className="text-[11px] text-soft-text uppercase tracking-wider">
                                    {t(`types.${meta.key}`, meta.key)}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-soft-text hover:bg-medium-bg hover:text-strong-text transition-colors"
                    >
                        <FaXmark className="text-lg" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Status */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-soft-text font-medium">État</span>
                        {isDone ? (
                            <span className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                                <FaCircleCheck /> Complété
                            </span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-medium-bg rounded-full overflow-hidden w-24">
                                    <div
                                        className="h-full bg-primary transition-all"
                                        style={{ width: `${event.percentage ?? 0}%` }}
                                    />
                                </div>
                                <span className="text-xs font-semibold text-soft-text min-w-fit">
                                    {event.percentage ?? 0}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Dates */}
                    <div className="space-y-2">
                        {startDate && (
                            <div className="flex items-center gap-3 text-sm text-strong-text">
                                <FaClock className="shrink-0 text-soft-text" />
                                <span className="font-semibold tabular-nums">
                                    {event.fulldayevent
                                        ? t("all-day", "Journée")
                                        : `${fmtTime(startDate)}${
                                              endDate && endDate.getTime() !== startDate.getTime()
                                                  ? ` - ${fmtTime(endDate)}`
                                                  : ""
                                          }`}
                                </span>
                            </div>
                        )}
                        {event.location && (
                            <div className="flex items-start gap-3 text-sm text-strong-text">
                                <FaMapPin className="shrink-0 text-soft-text mt-0.5" />
                                <span>{event.location}</span>
                            </div>
                        )}
                    </div>

                    {/* Editable fields */}
                    <div className="space-y-3 border-t border-soft-border pt-4">
                        {isEditing ? (
                            <>
                                <div>
                                    <label className="text-xs font-semibold text-soft-text uppercase tracking-wider">
                                        Titre
                                    </label>
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={(e) => {
                                            setLabel(e.target.value);
                                            if (formError) setFormError("");
                                        }}
                                        className={`mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                                            formError ? "border-red-400" : "border-soft-border"
                                        }`}
                                    />
                                    {formError && (
                                        <p className="mt-1 text-xs text-red-600">{formError}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-soft-text uppercase tracking-wider">
                                        Notes
                                    </label>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        rows={3}
                                        className="mt-1 w-full px-3 py-2 border border-soft-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                {note && (
                                    <div>
                                        <p className="text-xs font-semibold text-soft-text uppercase tracking-wider mb-2">
                                            Notes
                                        </p>
                                        <p className="text-sm text-strong-text bg-medium-bg/50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                                            {note}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer - Actions */}
                <div className="sticky bottom-0 flex gap-2 bg-medium-bg/40 border-t border-soft-border px-4 py-3">
                    {isEditing ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setLabel(event?.label || "");
                                    setNote(event?.note || "");
                                    setFormError("");
                                    setIsEditing(false);
                                }}
                                disabled={saving}
                                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-soft-border bg-white text-strong-text hover:bg-medium-bg transition-colors disabled:opacity-60"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:brightness-110 transition-[filter] disabled:opacity-60"
                            >
                                {saving ? "Enregistrement..." : "Enregistrer"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-soft-border bg-white text-strong-text hover:bg-medium-bg transition-colors"
                            >
                                Éditer
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenFull(event.id);
                                }}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:brightness-110 transition-[filter]"
                            >
                                Détails
                                <FaArrowRight className="text-[11px]" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
