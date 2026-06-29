import { useEffect, useState, useCallback } from "react";
import { FaAddressCard, FaArrowsRotate, FaTrash, FaPlus } from "react-icons/fa6";
import toast from "react-hot-toast";

import { FkPicker } from "src/lib/forms/FkPicker";
import { notifyAccessDenied } from "src/lib/permissions/notifyAccessDenied";

// "Contacts / addresses" section displayed under the lines on the five
// document detail desktop views (Proposal / Order / Invoice / SupplierOrder /
// SupplierInvoice). Mirrors the Dolibarr "Contacts/adresses" tab: it lists the
// contacts linked to the document (external thirdparty contacts + internal
// users) and lets the user attach a new one with a contact type, or remove an
// existing link.
//
// Server side: GET/POST/DELETE <feature>/{id}/contact(s) wired through the
// shared DocumentContactTrait. Each call returns { contacts, types } so the UI
// stays in sync without a manual reload.
//
// Conventions UI desktop épurées (cf .claude/CLAUDE.md):
//   - bg-white rounded-xl border border-soft-border (no shadow)
//   - density tight (p-3/p-4 max), separators via border-b
//   - hover:bg-medium-bg/50 on rows, transition-colors only.
//
// Props:
//   docId       number  Required. Dolibarr document id.
//   dataSource  object  Required. The useDb<Feature>() hook instance exposing
//                       listContacts / addContact / removeContact.
//   className   string  Optional extra class for the outer <section>.
export const DocumentContactsSection = ({ docId, dataSource, className = "" }) => {
    const [contacts, setContacts] = useState([]);
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [busyRowid, setBusyRowid] = useState(0);
    const [adding, setAdding] = useState(false);
    // Encoded "<source>:<typeId>" so a single <select> covers both the
    // external (thirdparty contacts) and internal (users) type lists.
    const [typeValue, setTypeValue] = useState("");
    const [contactId, setContactId] = useState(0);

    const hasClient = !!(dataSource && dataSource.listContacts);

    const load = useCallback(async () => {
        if (!hasClient || !docId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await dataSource.listContacts(docId);
            setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
            setTypes(Array.isArray(data?.types) ? data.types : []);
        } catch (err) {
            console.error("DocumentContactsSection.load error", err);
            setError("Erreur de chargement des contacts");
            setContacts([]);
            setTypes([]);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, docId]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasClient, docId]);

    const applyPayload = (data) => {
        if (Array.isArray(data?.contacts)) setContacts(data.contacts);
        if (Array.isArray(data?.types)) setTypes(data.types);
    };

    const handleAdd = async () => {
        if (!typeValue || !contactId) {
            toast.error("Sélectionnez un type et un contact");
            return;
        }
        const sep = typeValue.indexOf(":");
        const source = typeValue.slice(0, sep);
        const typeId = Number(typeValue.slice(sep + 1));
        setAdding(true);
        try {
            const data = await dataSource.addContact(docId, { contactId, typeId, source });
            applyPayload(data);
            setContactId(0);
            setTypeValue("");
            toast.success("Contact ajouté");
        } catch (err) {
            console.error("DocumentContactsSection.handleAdd error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors de l'ajout du contact");
            }
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (rowid) => {
        setBusyRowid(rowid);
        try {
            const data = await dataSource.removeContact(docId, rowid);
            applyPayload(data);
        } catch (err) {
            console.error("DocumentContactsSection.handleRemove error", err);
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 403) {
                notifyAccessDenied(err);
            } else {
                toast.error("Erreur lors du retrait du contact");
            }
        } finally {
            setBusyRowid(0);
        }
    };

    const externalTypes = types.filter((t) => t.source === "external");
    const internalTypes = types.filter((t) => t.source === "internal");

    return (
        <section className={`bg-white rounded-xl border border-soft-border overflow-hidden ${className}`}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-soft-border">
                <div className="flex items-center gap-2">
                    <FaAddressCard className="text-soft-text text-sm" />
                    <h2 className="text-sm font-semibold text-strong-text">Contacts</h2>
                    {!loading && (
                        <span className="text-[11px] text-soft-text">({contacts.length})</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="p-1.5 text-soft-text hover:text-strong-text rounded-md hover:bg-medium-bg disabled:opacity-50 transition-colors"
                    aria-label="Actualiser la liste"
                    title="Actualiser"
                >
                    <FaArrowsRotate className={`text-xs ${loading ? "animate-spin" : ""}`} />
                </button>
            </header>

            {error && (
                <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-[12px]">
                    {error}
                </div>
            )}

            <div className="px-2 py-1">
                {loading && contacts.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Chargement...
                    </div>
                )}

                {!loading && contacts.length === 0 && (
                    <div className="px-2 py-4 text-center text-soft-text text-[12px]">
                        Aucun contact lié
                    </div>
                )}

                {contacts.length > 0 && (
                    <ul className="divide-y divide-soft-border/60">
                        {contacts.map((c) => (
                            <li
                                key={c.rowid}
                                className="flex items-center gap-2 px-2 py-2 hover:bg-medium-bg/50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-strong-text truncate">
                                        {[c.lastname, c.firstname].filter(Boolean).join(" ") || `#${c.contactId}`}
                                        {c.source === "internal" && (
                                            <span className="ml-1 text-[10px] text-soft-text">(utilisateur)</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-soft-text truncate">
                                        <span className="text-primary">{c.typeLabel}</span>
                                        {c.email && <> &middot; {c.email}</>}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(c.rowid)}
                                    disabled={busyRowid === c.rowid}
                                    className="h-[26px] px-2 rounded text-[11px] flex items-center gap-1 bg-white border border-soft-border text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors"
                                    title="Retirer ce contact"
                                >
                                    <FaTrash className="text-[10px]" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Add a contact: type select + contact picker + add button. */}
            <div className="border-t border-soft-border px-3 py-2.5 flex flex-col gap-2">
                <select
                    value={typeValue}
                    onChange={(e) => setTypeValue(e.target.value)}
                    className="h-[30px] px-2 rounded border border-soft-border text-[12px] text-strong-text bg-white"
                >
                    <option value="">Type de contact...</option>
                    {externalTypes.length > 0 && (
                        <optgroup label="Contacts du tiers">
                            {externalTypes.map((t) => (
                                <option key={`external:${t.id}`} value={`external:${t.id}`}>{t.label}</option>
                            ))}
                        </optgroup>
                    )}
                    {internalTypes.length > 0 && (
                        <optgroup label="Utilisateurs internes">
                            {internalTypes.map((t) => (
                                <option key={`internal:${t.id}`} value={`internal:${t.id}`}>{t.label}</option>
                            ))}
                        </optgroup>
                    )}
                </select>

                <FkPicker
                    endpoint="contact"
                    value={contactId}
                    onChange={(v) => setContactId(Number(v) || 0)}
                    placeholder="Rechercher un contact..."
                />

                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={adding || !typeValue || !contactId}
                    className="h-[30px] px-3 rounded text-[12px] flex items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    <FaPlus className="text-[11px]" />
                    <span>Ajouter le contact</span>
                </button>
            </div>
        </section>
    );
};
