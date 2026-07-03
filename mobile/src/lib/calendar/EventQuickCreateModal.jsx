import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Textarea } from "@cap-rel/smartcommon";
import { FaXmark } from "react-icons/fa6";

import { dateToTs, addHours, toLocalInputValue } from "./dateUtils";

// Lightweight modal for rapid event creation (Nextcloud-style).
// Shows: title + dates + location + description + full-day checkbox.
// Advanced fields (type, percentage, contact...) hidden behind "More details" link.
//
// Props:
//   isOpen: boolean
//   defaultDate: Date instance (click slot, or drag selection start)
//   defaultEndDate: Date instance (drag selection end; +30 min if absent)
//   onClose: callback to hide modal
//   onSubmit: (payload) => Promise<{id}>  [from useDbAgenda.create]
//
// The parent remounts this modal (via a `key` on the selected slot) each time a
// new slot is picked, so the initial start/end state below always reflects the
// current selection.
//
export const EventQuickCreateModal = ({ isOpen, defaultDate, defaultEndDate, onClose, onSubmit }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Local form state
    const [title, setTitle] = useState("");
    const [location, setLocation] = useState("");
    const [description, setDescription] = useState("");
    const [isFullDay, setIsFullDay] = useState(false);
    const [startDate, setStartDate] = useState(defaultDate || new Date());
    const [endDate, setEndDate] = useState(() => defaultEndDate || addHours(defaultDate || new Date(), 0.5));

    const handleSubmit = useCallback(async () => {
        if (!title.trim()) {
            setError("Veuillez saisir un titre");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const payload = {
                label: title.trim(),
                location: location.trim() || null,
                note: description.trim() || null,
                fulldayevent: isFullDay ? 1 : 0,
                datep: dateToTs(startDate),
                datef: dateToTs(endDate),
                typeCode: "AC_OTH",
                percentage: 0,
            };

            const result = await onSubmit(payload);
            if (result?.id) {
                setTitle("");
                setLocation("");
                setDescription("");
                setIsFullDay(false);
                onClose();
            }
        } catch (err) {
            console.error("[EventQuickCreateModal] submit error", err);
            setError("Erreur lors de la création");
        } finally {
            setLoading(false);
        }
    }, [title, location, description, isFullDay, startDate, endDate, onSubmit, onClose]);

    const handleOpenDetails = useCallback(() => {
        onClose();
        const params = new URLSearchParams();
        if (title.trim()) params.set("label", title);
        if (location.trim()) params.set("location", location);
        if (description.trim()) params.set("note_private", description);
        params.set("datep", dateToTs(startDate));
        params.set("datef", dateToTs(endDate));
        params.set("fulldayevent", isFullDay ? "1" : "0");
        const qs = params.toString();
        navigate(`/agenda/new${qs ? "?" + qs : ""}`);
    }, [title, location, description, isFullDay, startDate, endDate, navigate, onClose]);

    if (!isOpen || !defaultDate) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-xl border border-soft-border shadow-lg w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-soft-border bg-medium-bg/30">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-primary" />
                        <span className="text-sm font-semibold text-strong-text">principal</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-soft-bg transition-colors"
                    >
                        <FaXmark size={16} className="text-soft-text" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 py-4 space-y-3">
                    {/* Title (required) */}
                    <div>
                        <Input
                            type="text"
                            placeholder="Titre de l'événement"
                            value={title}
                            onChange={(v) => setTitle(v)}
                            autoFocus
                            className="w-full"
                        />
                    </div>

                    {/* Date/Time row */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Input
                                type="datetime-local"
                                value={toLocalInputValue(startDate)}
                                onChange={(v) => {
                                    if (v) setStartDate(new Date(v));
                                }}
                                className="w-full text-[13px]"
                            />
                        </div>
                        <div>
                            <Input
                                type="datetime-local"
                                value={toLocalInputValue(endDate)}
                                onChange={(v) => {
                                    if (v) setEndDate(new Date(v));
                                }}
                                className="w-full text-[13px]"
                            />
                        </div>
                    </div>

                    {/* Full-day checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isFullDay}
                            onChange={(e) => setIsFullDay(e.target.checked)}
                            className="h-4 w-4 rounded border-soft-border"
                        />
                        <span className="text-sm font-medium text-strong-text">Journée entière</span>
                    </label>

                    {/* Location */}
                    <div>
                        <Input
                            type="text"
                            placeholder="Ajouter un lieu"
                            value={location}
                            onChange={(v) => setLocation(v)}
                            className="w-full"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <Textarea
                            placeholder="Ajouter une description"
                            value={description}
                            onChange={(v) => setDescription(v)}
                            className="w-full text-sm"
                            rows={3}
                        />
                    </div>

                    {/* Error message */}
                    {error && <div className="text-sm text-red-600 font-medium">{error}</div>}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-soft-border bg-medium-bg/10 flex gap-2 justify-between">
                    <button
                        type="button"
                        onClick={handleOpenDetails}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Plus de détails
                    </button>
                    <Button
                        onClick={handleSubmit}
                        loading={loading}
                        className="px-6 py-2"
                    >
                        Enregistrer
                    </Button>
                </div>
            </div>
        </div>
    );
};
