import { useCallback, useEffect, useRef, useState } from "react";
import { FaXmark, FaPen, FaTrash, FaDownload, FaFloppyDisk } from "react-icons/fa6";

import { useConfirm } from "@cap-rel/smartcommon";

import { DocumentHeaderFields } from "src/lib/datatable";
import { AutoForm } from "src/lib/forms/AutoForm";
import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { base64ToBlob, triggerDownload, canShare, shareVCard } from "src/utils/functions/vcard";

import { HEADER_OVERRIDES } from "../ContactPage/ContactPage.desktop";

// Keys excluded from the inline AutoForm (computed / system-managed).
// Mirrors ContactEditPage.desktop so the popup edits the same field set.
const EDIT_EXCLUDE_KEYS = [
    "ref",
    "datec",
    "tms",
    "fkUserAuthor",
    "fkUserModif",
    "fkUserCreat",
    "importKey",
    "datemodification",
    "datecreation",
    "lastMainDoc",
    "modelPdf",
];

// Desktop-only detail popup for a contact. A contact fiche is header-only
// (no lines) so it fits comfortably in a modal: consult in place, switch to
// inline edit (AutoForm from the backend describe() catalog) and save without
// leaving the list.
//
// Conventions UI épurées (cf .claude/CLAUDE.md): the floating panel carries a
// shadow-lg (it must detach from the backdrop -- the documented exception),
// but its inner cards stay flat (border only), density tight, no double frame.
//
// Props:
//   id       -- contact id to display (modal is open iff id != null)
//   onClose  -- () => void, hide the modal
//   onChanged-- optional () => void, called after a successful update/delete so
//               the parent list refreshes (wired to ctx.refresh of the DataTable)
export const ContactDetailModal = ({ id, onClose, onChanged }) => {
    const dbContacts = useDbContacts();
    const { confirm } = useConfirm() ?? {};

    const [mode, setMode] = useState("view");
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);

    // Live values from the inline AutoForm, submitted via the footer button.
    const valuesRef = useRef({});

    // Stable describe reference so AutoForm's mount effect runs once.
    const describeRef = useRef(null);
    if (describeRef.current === null) {
        describeRef.current = ({ signal } = {}) => dbContacts.describe({ signal });
    }

    const hasClient = !!dbContacts.get;

    useEffect(() => {
        if (!hasClient || id == null) return;
        let cancelled = false;
        setMode("view");
        setError(null);
        setLoading(true);
        setItem(null);
        dbContacts
            .get(id)
            .then((data) => {
                if (cancelled) return;
                setItem(data);
                valuesRef.current = data ?? {};
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[ContactDetailModal] dbContacts.get error", err);
                setError(err?.response?.status === 404 ? "Contact introuvable" : "Erreur de chargement");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [hasClient, id]);

    const fullName = item
        ? [item.civility, item.firstname, item.lastname].filter(Boolean).join(" ").trim()
        : "";

    const handleSave = useCallback(async () => {
        setSaving(true);
        setError(null);
        try {
            const payload = { ...valuesRef.current };
            if (payload.fkSoc !== undefined) payload.fkSoc = Number(payload.fkSoc ?? 0);
            if (payload.statut !== undefined) payload.statut = Number(payload.statut ?? 1);

            const data = await dbContacts.update(id, payload);
            setItem(data);
            valuesRef.current = data ?? {};
            setMode("view");
            onChanged?.();
        } catch (err) {
            console.error("[ContactDetailModal] update error", err);
            setError("Erreur lors de l'enregistrement");
        } finally {
            setSaving(false);
        }
    }, [dbContacts, id, onChanged]);

    const handleDelete = useCallback(async () => {
        const ok = confirm
            ? await confirm({
                type: "delete",
                title: "Supprimer ce contact ?",
                message: "Cette action est irréversible.",
                confirmText: "Supprimer",
                cancelText: "Annuler",
            })
            : true;
        if (!ok) return;

        setDeleting(true);
        try {
            await dbContacts.remove(id);
            onChanged?.();
            onClose?.();
        } catch (err) {
            console.error("[ContactDetailModal] remove error", err);
            setError("Suppression impossible");
            setDeleting(false);
        }
    }, [confirm, dbContacts, id, onChanged, onClose]);

    const handleExportVCard = useCallback(async () => {
        if (!item?.id) return;
        try {
            const data = await dbContacts.exportVcard(item.id);
            if (!data?.content) {
                setError("Export vCard impossible");
                return;
            }
            const blob = base64ToBlob(data.content, data["content-type"] || "text/vcard");
            const filename = data.filename || "contact.vcf";
            if (canShare()) {
                const shared = await shareVCard(blob, filename, fullName || "Contact");
                if (shared) return;
            }
            triggerDownload(blob, filename);
        } catch (err) {
            console.error("[ContactDetailModal] exportVcard error", err);
            setError("Export vCard impossible");
        }
    }, [dbContacts, item, fullName]);

    // Escape closes in view mode only (avoid discarding edits silently).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && mode === "view" && !deleting) onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [mode, deleting, onClose]);

    if (id == null) return null;

    const busy = saving || deleting;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:p-8 overflow-auto"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && mode === "view" && !busy) onClose?.();
            }}
        >
            <div className="w-full max-w-3xl my-auto bg-white rounded-xl border border-soft-border shadow-lg flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <header className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-soft-border">
                    <h2 className="text-base font-bold text-strong-text truncate">
                        {loading ? "Chargement..." : (fullName || "Contact")}
                    </h2>
                    {!loading && item?.poste && (
                        <span className="text-[12px] text-soft-text truncate">{item.poste}</span>
                    )}
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="p-1.5 rounded-md text-soft-text hover:bg-medium-bg hover:text-strong-text disabled:opacity-50 transition-colors"
                        aria-label="Fermer"
                    >
                        <FaXmark className="text-sm" />
                    </button>
                </header>

                {error && (
                    <div className="shrink-0 mx-4 mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                        {error}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                    {loading ? (
                        <div className="text-center text-soft-text text-sm py-10">Chargement...</div>
                    ) : mode === "edit" ? (
                        <AutoForm
                            describe={describeRef.current}
                            value={item ?? {}}
                            mode="update"
                            onChange={(v) => { valuesRef.current = v; }}
                            onSubmit={(v) => { valuesRef.current = v; handleSave(); }}
                            excludeKeys={EDIT_EXCLUDE_KEYS}
                        />
                    ) : item ? (
                        <DocumentHeaderFields
                            object={item}
                            feature="contact"
                            dataSource={dbContacts}
                            storageKey="dolipocket.contactpage.header"
                            title="Informations"
                            overrides={HEADER_OVERRIDES}
                        />
                    ) : null}
                </div>

                {/* Footer actions */}
                {!loading && item && (
                    <footer className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-soft-border bg-white">
                        {mode === "edit" ? (
                            <>
                                <span className="flex-1" />
                                <button
                                    type="button"
                                    onClick={() => { valuesRef.current = item ?? {}; setMode("view"); }}
                                    disabled={saving}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                >
                                    <FaXmark className="text-[11px]" />
                                    <span>Annuler</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                    <FaFloppyDisk className="text-[11px]" />
                                    <span>{saving ? "Enregistrement..." : "Enregistrer"}</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={handleExportVCard}
                                    disabled={busy}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-strong-text hover:bg-medium-bg disabled:opacity-50 transition-colors"
                                    title="Exporter vCard"
                                >
                                    <FaDownload className="text-[11px]" />
                                    <span>vCard</span>
                                </button>
                                <span className="flex-1" />
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={busy}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                >
                                    <FaTrash className="text-[11px]" />
                                    <span>Supprimer</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { valuesRef.current = item ?? {}; setError(null); setMode("edit"); }}
                                    disabled={busy}
                                    className="h-[28px] px-3 rounded text-[12px] flex items-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                >
                                    <FaPen className="text-[11px]" />
                                    <span>Modifier</span>
                                </button>
                            </>
                        )}
                    </footer>
                )}
            </div>
        </div>
    );
};
