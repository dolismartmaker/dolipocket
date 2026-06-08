import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useDbContacts } from "src/db/stores/contacts/useDbContacts";
import { useMenu } from "src/lib/permissions";
import {
    MasterDetailLayout,
    EmptyDetail,
    TouchList,
    TouchListItem,
    DocumentDetailPane,
} from "src/lib/tablet";
import { HEADER_OVERRIDES } from "../ContactPage/ContactPage.desktop";

// Tablet master-detail workspace for Contacts. Used by BOTH:
//   - /contacts        (list route, no preselection)
//   - /contacts/:id    (detail route, preselects via initialId)
// The selection lives in component state (not the URL), so tapping a row
// updates the right pane in place without remounting the list.

const formatName = (c) => {
    const parts = [];
    if (c.civility) parts.push(c.civility);
    if (c.firstname) parts.push(c.firstname);
    if (c.lastname) parts.push(c.lastname);
    return parts.join(" ").trim() || "(sans nom)";
};

const renderItem = (c) => (
    <TouchListItem
        primary={formatName(c)}
        secondary={[c.poste, c.email || c.phoneMobile || c.phonePro].filter(Boolean).join(" - ")}
    />
);

export const ContactsWorkspace = ({ initialId = null }) => {
    const navigate = useNavigate();
    const db = useDbContacts();
    const { has } = useMenu();

    const [selectedId, setSelectedId] = useState(initialId);
    const [reloadToken, setReloadToken] = useState(0);

    // No perPage: that would map to `limit` and force the paginated backend
    // branch which ignores `q`. Without it, the request hits indexLegacy which
    // performs a real server-side search on q.
    const load = useCallback(({ q }) => db.list({ q }), [db]);

    return (
        <MasterDetailLayout
            master={
                <TouchList
                    title="Contacts"
                    searchPlaceholder="Rechercher un contact..."
                    load={load}
                    reloadToken={reloadToken}
                    getKey={(c) => c.id}
                    renderItem={renderItem}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onNew={has("contact.create") ? () => navigate("/contacts/new") : null}
                />
            }
            detail={
                selectedId ? (
                    <DocumentDetailPane
                        key={selectedId}
                        id={selectedId}
                        db={db}
                        feature="contact"
                        storageKey="dolipocket.contact.tablet.header"
                        title="Fiche contact"
                        renderTitle={(o) => formatName(o)}
                        headerOverrides={HEADER_OVERRIDES}
                        onEdit={has("contact.write")
                            ? () => navigate(`/contacts/${selectedId}/edit`)
                            : null}
                        onDeleted={() => {
                            setSelectedId(null);
                            setReloadToken((t) => t + 1);
                        }}
                    />
                ) : (
                    <EmptyDetail label="Sélectionnez un contact" hint="Choisissez un contact dans la liste pour voir sa fiche." />
                )
            }
        />
    );
};
